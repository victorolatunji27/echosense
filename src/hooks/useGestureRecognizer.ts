import { useEffect, useRef, useState } from 'react'
import { GestureRecognizer, FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { classifyASLGesture, type Landmark } from '../utils/aslClassifier'
import { orderHandsByHandedness, extractFaceFeatures, type TwoHandSlots } from '../utils/frameFeatures'
import { ENABLE_WIDE_CAPTURE } from '../utils/modelConfig'
import type { CNNPrediction } from './useCNNClassifier'
import type { LSTMPrediction } from './useLSTMClassifier'

const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const EMPTY_HAND_SLOTS: TwoHandSlots = { right: null, left: null, rightIndex: null, leftIndex: null }

const MEDIAPIPE_BUILTINS = new Set([
  'Thumb_Up', 'Thumb_Down', 'Open_Palm', 'Closed_Fist',
  'Victory', 'ILoveYou', 'Pointing_Up',
])

export type GestureSource = 'lstm' | 'cnn' | 'mediapipe' | 'geometric' | null

// CNN cadence: the rAF loop is synchronous but classify() is async, so we
// kick off an inference at most every CNN_INTERVAL_MS and consume the most
// recent result while it is still fresh.
const CNN_INTERVAL_MS = 120
const CNN_RESULT_TTL_MS = 400

// Prediction smoothing: a gesture is only surfaced when at least
// SMOOTHING_MIN_AGREEMENT of the last SMOOTHING_WINDOW per-frame
// predictions agree. 4 agreeing frames is ~66ms at 60fps / ~133ms at
// 30fps, keeping added latency under ~150ms.
const SMOOTHING_WINDOW = 7
const SMOOTHING_MIN_AGREEMENT = 4

export interface RawPrediction {
  name: string
  score: number
  source: GestureSource
}

export type SmoothedPrediction =
  | { kind: 'gesture'; name: string; score: number; source: GestureSource }
  | { kind: 'none' }
  | { kind: 'unsure' }

/**
 * Majority vote over the rolling per-frame prediction window.
 * - a non-'None' gesture with >= minAgreement votes wins
 * - consistently 'None' (or a window still filling up) is a quiet no-gesture
 * - otherwise the frames disagree: explicit "unsure" instead of a guess
 */
export function tallyVotes(
  votes: RawPrediction[],
  minAgreement: number = SMOOTHING_MIN_AGREEMENT,
): SmoothedPrediction {
  const counts = new Map<string, number>()
  for (const v of votes) {
    counts.set(v.name, (counts.get(v.name) ?? 0) + 1)
  }

  let winner: string | null = null
  let winnerCount = 0
  for (const [name, count] of counts) {
    if (name !== 'None' && count > winnerCount) {
      winner = name
      winnerCount = count
    }
  }

  if (winner && winnerCount >= minAgreement) {
    // Most recent vote for the winner, so score/source reflect the tier
    // that actually produced it
    for (let i = votes.length - 1; i >= 0; i--) {
      if (votes[i].name === winner) {
        const { name, score, source } = votes[i]
        return { kind: 'gesture', name, score, source }
      }
    }
  }

  if ((counts.get('None') ?? 0) >= minAgreement || votes.length < minAgreement) {
    return { kind: 'none' }
  }
  return { kind: 'unsure' }
}

interface GestureRecognizerOptions {
  // Optional CNN classifier — used when model files are present
  cnnClassify?: (video: HTMLVideoElement, landmarks: Landmark[]) => Promise<CNNPrediction | null>
  cnnAvailable?: boolean
  // Optional LSTM classifier — highest priority when buffer is full
  lstmClassify?: (buffer: Landmark[][]) => LSTMPrediction | null
  lstmAvailable?: boolean
  // Landmark buffer for LSTM
  getLandmarkBuffer?: () => Landmark[][]
  isBufferReady?: () => boolean
  // Rank MediaPipe built-ins above the CNN. Phrase and practice modes only
  // consume the 7 built-in gestures, and CNN letter predictions (a fist is
  // also A/S/E…) would otherwise shadow them.
  prioritizeMediaPipe?: boolean
}

// Dev-only tier logging — logs when the winning tier/gesture changes so we
// can measure which classifier actually fires and at what confidence.
let lastLoggedTier = ''
function logTier(source: GestureSource, gesture: string | null, confidence: number) {
  if (!import.meta.env.DEV) return
  const key = `${source}:${gesture}`
  if (key === lastLoggedTier) return
  lastLoggedTier = key
  console.debug(
    `[recognizer] tier=${source ?? 'none'} gesture=${gesture ?? 'none'} conf=${confidence.toFixed(2)}`,
  )
}

interface GestureResult {
  // Primary hand (right if present, else left) — unchanged shape/meaning
  // from before two-hand support, so the CNN/geometric classifier and the
  // legacy LSTM buffer keep working exactly as they did.
  landmarks: Landmark[] | null
  gestureName: string | null
  gestureScore: number
  isLoaded: boolean
  source: GestureSource
  // A hand is in frame but recent predictions disagree — the UI should
  // show a soft "didn't catch that" hint instead of a guess.
  isUnsure: boolean
  // Both hands in fixed [right, left] slots — plumbing for the wide
  // capture pipeline (see modelConfig.ts ENABLE_WIDE_CAPTURE) and the dev
  // capture overlay. Not consumed by any classifier yet.
  twoHandLandmarks: TwoHandSlots
  // Compact non-manual (face) feature vector, or null when face tracking
  // is disabled or no face is detected. Same caveat as twoHandLandmarks.
  faceFeatures: number[] | null
}

export function useGestureRecognizer(
  videoRef: React.RefObject<HTMLVideoElement>,
  options: GestureRecognizerOptions = {}
): GestureResult {
  const {
    cnnClassify,
    cnnAvailable = false,
    lstmClassify,
    lstmAvailable = false,
    getLandmarkBuffer,
    isBufferReady,
    prioritizeMediaPipe = false,
  } = options

  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null)
  const rafRef = useRef<number>(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null)
  const [gestureName, setGestureName] = useState<string | null>(null)
  const [gestureScore, setGestureScore] = useState(0)
  const [source, setSource] = useState<GestureSource>(null)
  const [isUnsure, setIsUnsure] = useState(false)
  const [twoHandLandmarks, setTwoHandLandmarks] = useState<TwoHandSlots>(EMPTY_HAND_SLOTS)
  const [faceFeatures, setFaceFeatures] = useState<number[] | null>(null)

  // Keep latest option refs so the rAF loop always reads current values
  const cnnClassifyRef = useRef(cnnClassify)
  const lstmClassifyRef = useRef(lstmClassify)
  const getLandmarkBufferRef = useRef(getLandmarkBuffer)
  const isBufferReadyRef = useRef(isBufferReady)
  const cnnAvailableRef = useRef(cnnAvailable)
  const lstmAvailableRef = useRef(lstmAvailable)
  const prioritizeMediaPipeRef = useRef(prioritizeMediaPipe)

  useEffect(() => { cnnClassifyRef.current = cnnClassify }, [cnnClassify])
  useEffect(() => { lstmClassifyRef.current = lstmClassify }, [lstmClassify])
  useEffect(() => { getLandmarkBufferRef.current = getLandmarkBuffer }, [getLandmarkBuffer])
  useEffect(() => { isBufferReadyRef.current = isBufferReady }, [isBufferReady])
  useEffect(() => { cnnAvailableRef.current = cnnAvailable }, [cnnAvailable])
  useEffect(() => { lstmAvailableRef.current = lstmAvailable }, [lstmAvailable])
  useEffect(() => { prioritizeMediaPipeRef.current = prioritizeMediaPipe }, [prioritizeMediaPipe])

  // Latest CNN inference state (written by the async classify, read by the
  // synchronous rAF loop)
  const cnnBusyRef = useRef(false)
  const cnnLastKickRef = useRef(0)
  const cnnResultRef = useRef<(CNNPrediction & { at: number }) | null>(null)

  // Rolling buffer of per-frame raw predictions for majority-vote smoothing
  const voteBufferRef = useRef<RawPrediction[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      )
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
      })

      // Face tracking runs as a second, independent MediaPipe task on the
      // same video frames. It's additive — if it fails to load (e.g. slow
      // network, unsupported GPU path), hand tracking still works.
      let faceLandmarker: FaceLandmarker | null = null
      if (ENABLE_WIDE_CAPTURE) {
        try {
          faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: FACE_LANDMARKER_MODEL_URL,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: true,
          })
        } catch (err) {
          console.warn('[useGestureRecognizer] FaceLandmarker failed to load — continuing hand-only', err)
        }
      }

      if (!cancelled) {
        recognizerRef.current = recognizer
        faceLandmarkerRef.current = faceLandmarker
        setIsLoaded(true)
      } else {
        recognizer.close()
        faceLandmarker?.close()
      }
    }

    load().catch(console.error)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      recognizerRef.current?.close()
      faceLandmarkerRef.current?.close()
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) return

    function loop() {
      const video = videoRef.current
      const recognizer = recognizerRef.current
      if (video && recognizer && video.readyState >= 2) {
        const results = recognizer.recognizeForVideo(video, Date.now())

        // Two hands, ordered into fixed [right, left] slots. The primary
        // hand (right if present, else left) is what every existing
        // single-hand consumer (CNN, geometric classifier, legacy LSTM
        // buffer) reads — same shape/meaning as before two-hand support.
        const handSlots = orderHandsByHandedness(results.landmarks, results.handedness)
        const primaryLandmarks = handSlots.right ?? handSlots.left ?? null
        const primaryIndex = handSlots.rightIndex ?? handSlots.leftIndex

        const mediapipeGesture =
          primaryIndex !== null ? (results.gestures[primaryIndex]?.[0]?.categoryName ?? null) : null
        const score =
          primaryIndex !== null ? (results.gestures[primaryIndex]?.[0]?.score ?? 0) : 0

        setLandmarks(primaryLandmarks)
        setTwoHandLandmarks(handSlots)

        // Face tracking runs as a second, independent MediaPipe task on the
        // same frame. Plumbing only — nothing consumes this yet.
        if (ENABLE_WIDE_CAPTURE && faceLandmarkerRef.current) {
          const faceResult = faceLandmarkerRef.current.detectForVideo(video, Date.now())
          setFaceFeatures(extractFaceFeatures(faceResult.faceBlendshapes))
        } else {
          setFaceFeatures(null)
        }

        // ── Priority waterfall ────────────────────────────────────────────
        //
        // 1. LSTM  — motion gestures, requires 30-frame buffer
        // 2. CNN   — static signs from trained image classifier
        // 3. MediaPipe built-in — 7 reliable gesture classes
        // 4. Geometric — landmark math, always available as fallback
        //
        // Each level only runs when the model is available.

        // Kick off a throttled CNN inference while a hand is in frame. The
        // result lands in cnnResultRef and is consumed by tier 2 below on a
        // later frame — the loop itself never awaits.
        const now = performance.now()
        if (primaryLandmarks && cnnAvailableRef.current && cnnClassifyRef.current) {
          if (!cnnBusyRef.current && now - cnnLastKickRef.current >= CNN_INTERVAL_MS) {
            cnnBusyRef.current = true
            cnnLastKickRef.current = now
            cnnClassifyRef.current(video, primaryLandmarks)
              .then((result) => {
                cnnResultRef.current = result
                  ? { ...result, at: performance.now() }
                  : null
              })
              .catch(() => { cnnResultRef.current = null })
              .finally(() => { cnnBusyRef.current = false })
          }
        } else if (!primaryLandmarks) {
          // Hand left the frame — drop any stale prediction immediately
          cnnResultRef.current = null
        }

        // Pick this frame's raw prediction from the highest tier that fires
        let raw: RawPrediction = { name: 'None', score: 0, source: null }

        const lstmResult =
          lstmAvailableRef.current &&
          lstmClassifyRef.current &&
          isBufferReadyRef.current?.() &&
          getLandmarkBufferRef.current
            ? lstmClassifyRef.current(getLandmarkBufferRef.current())
            : null
        const cnnResult = cnnResultRef.current
        const mediapipeFires =
          !!mediapipeGesture && mediapipeGesture !== 'None' && MEDIAPIPE_BUILTINS.has(mediapipeGesture)

        if (lstmResult) {
          // 1. LSTM (highest priority — motion overrides static)
          raw = { name: lstmResult.gestureKey, score: lstmResult.confidence, source: 'lstm' }
        } else if (mediapipeFires && prioritizeMediaPipeRef.current) {
          // 2a. MediaPipe built-in first when the consumer only wants the
          //     7 built-ins (phrase/practice) — CNN letters would shadow them
          raw = { name: mediapipeGesture!, score, source: 'mediapipe' }
        } else if (primaryLandmarks && cnnResult && now - cnnResult.at < CNN_RESULT_TTL_MS) {
          // 2. CNN (trained image classifier — most recent fresh result)
          raw = { name: cnnResult.gestureKey, score: cnnResult.confidence, source: 'cnn' }
        } else if (mediapipeFires) {
          // 3. MediaPipe built-in
          raw = { name: mediapipeGesture!, score, source: 'mediapipe' }
        } else if (primaryLandmarks) {
          // 4. Geometric classifier (always available)
          const geometric = classifyASLGesture(primaryLandmarks)
          raw = {
            name: geometric ?? 'None',
            score: geometric ? 0.85 : 0,
            source: geometric ? 'geometric' : null,
          }
        }

        logTier(raw.source, raw.name, raw.score)

        // ── Majority-vote smoothing ───────────────────────────────────────
        //
        // Surface a gesture only when most recent frames agree; while a hand
        // is visible but predictions disagree, report an explicit "unsure"
        // state instead of a guess. This applies to every tier.

        if (!primaryLandmarks) {
          voteBufferRef.current = []
          setGestureName('None')
          setGestureScore(0)
          setSource(null)
          setIsUnsure(false)
        } else {
          const votes = voteBufferRef.current
          votes.push(raw)
          if (votes.length > SMOOTHING_WINDOW) votes.shift()

          const smoothed = tallyVotes(votes)
          if (smoothed.kind === 'gesture') {
            setGestureName(smoothed.name)
            setGestureScore(smoothed.score)
            setSource(smoothed.source)
            setIsUnsure(false)
          } else {
            setGestureName('None')
            setGestureScore(0)
            setSource(null)
            setIsUnsure(smoothed.kind === 'unsure')
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isLoaded, videoRef])

  return {
    landmarks,
    gestureName,
    gestureScore,
    isLoaded,
    source,
    isUnsure,
    twoHandLandmarks,
    faceFeatures,
  }
}
