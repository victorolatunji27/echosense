import { useEffect, useRef, useState } from 'react'
import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision'
import { classifyASLGesture, type Landmark } from '../utils/aslClassifier'
import type { CNNPrediction } from './useCNNClassifier'
import type { LSTMPrediction } from './useLSTMClassifier'

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
  landmarks: Landmark[] | null
  gestureName: string | null
  gestureScore: number
  isLoaded: boolean
  source: GestureSource
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
  } = options

  const recognizerRef = useRef<GestureRecognizer | null>(null)
  const rafRef = useRef<number>(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [landmarks, setLandmarks] = useState<Landmark[] | null>(null)
  const [gestureName, setGestureName] = useState<string | null>(null)
  const [gestureScore, setGestureScore] = useState(0)
  const [source, setSource] = useState<GestureSource>(null)

  // Keep latest option refs so the rAF loop always reads current values
  const cnnClassifyRef = useRef(cnnClassify)
  const lstmClassifyRef = useRef(lstmClassify)
  const getLandmarkBufferRef = useRef(getLandmarkBuffer)
  const isBufferReadyRef = useRef(isBufferReady)
  const cnnAvailableRef = useRef(cnnAvailable)
  const lstmAvailableRef = useRef(lstmAvailable)

  useEffect(() => { cnnClassifyRef.current = cnnClassify }, [cnnClassify])
  useEffect(() => { lstmClassifyRef.current = lstmClassify }, [lstmClassify])
  useEffect(() => { getLandmarkBufferRef.current = getLandmarkBuffer }, [getLandmarkBuffer])
  useEffect(() => { isBufferReadyRef.current = isBufferReady }, [isBufferReady])
  useEffect(() => { cnnAvailableRef.current = cnnAvailable }, [cnnAvailable])
  useEffect(() => { lstmAvailableRef.current = lstmAvailable }, [lstmAvailable])

  // Latest CNN inference state (written by the async classify, read by the
  // synchronous rAF loop)
  const cnnBusyRef = useRef(false)
  const cnnLastKickRef = useRef(0)
  const cnnResultRef = useRef<(CNNPrediction & { at: number }) | null>(null)

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
        numHands: 1,
      })
      if (!cancelled) {
        recognizerRef.current = recognizer
        setIsLoaded(true)
      }
    }

    load().catch(console.error)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      recognizerRef.current?.close()
    }
  }, [])

  useEffect(() => {
    if (!isLoaded) return

    function loop() {
      const video = videoRef.current
      const recognizer = recognizerRef.current
      if (video && recognizer && video.readyState >= 2) {
        const results = recognizer.recognizeForVideo(video, Date.now())

        const rawLandmarks = results.landmarks[0] ?? null
        const mediapipeGesture = results.gestures[0]?.[0]?.categoryName ?? null
        const score = results.gestures[0]?.[0]?.score ?? 0

        setLandmarks(rawLandmarks)

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
        if (rawLandmarks && cnnAvailableRef.current && cnnClassifyRef.current) {
          if (!cnnBusyRef.current && now - cnnLastKickRef.current >= CNN_INTERVAL_MS) {
            cnnBusyRef.current = true
            cnnLastKickRef.current = now
            cnnClassifyRef.current(video, rawLandmarks)
              .then((result) => {
                cnnResultRef.current = result
                  ? { ...result, at: performance.now() }
                  : null
              })
              .catch(() => { cnnResultRef.current = null })
              .finally(() => { cnnBusyRef.current = false })
          }
        } else if (!rawLandmarks) {
          // Hand left the frame — drop any stale prediction immediately
          cnnResultRef.current = null
        }

        // 1. LSTM (highest priority — motion overrides static)
        if (
          lstmAvailableRef.current &&
          lstmClassifyRef.current &&
          isBufferReadyRef.current?.() &&
          getLandmarkBufferRef.current
        ) {
          const lstmResult = lstmClassifyRef.current(getLandmarkBufferRef.current())
          if (lstmResult) {
            setGestureName(lstmResult.gestureKey)
            setGestureScore(lstmResult.confidence)
            setSource('lstm')
            logTier('lstm', lstmResult.gestureKey, lstmResult.confidence)
            rafRef.current = requestAnimationFrame(loop)
            return
          }
        }

        // 2. CNN (trained image classifier — most recent fresh result)
        const cnnResult = cnnResultRef.current
        if (rawLandmarks && cnnResult && now - cnnResult.at < CNN_RESULT_TTL_MS) {
          setGestureName(cnnResult.gestureKey)
          setGestureScore(cnnResult.confidence)
          setSource('cnn')
          logTier('cnn', cnnResult.gestureKey, cnnResult.confidence)
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        // 3. MediaPipe built-in
        if (mediapipeGesture && mediapipeGesture !== 'None' && MEDIAPIPE_BUILTINS.has(mediapipeGesture)) {
          setGestureName(mediapipeGesture)
          setGestureScore(score)
          setSource('mediapipe')
          logTier('mediapipe', mediapipeGesture, score)
          rafRef.current = requestAnimationFrame(loop)
          return
        }

        // 4. Geometric classifier (always available)
        if (rawLandmarks) {
          const geometric = classifyASLGesture(rawLandmarks)
          setGestureName(geometric ?? 'None')
          setGestureScore(geometric ? 0.85 : 0)
          setSource(geometric ? 'geometric' : null)
          logTier(geometric ? 'geometric' : null, geometric ?? 'None', geometric ? 0.85 : 0)
        } else {
          setGestureName('None')
          setGestureScore(0)
          setSource(null)
          logTier(null, 'None', 0)
        }
      }
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isLoaded, videoRef])

  return { landmarks, gestureName, gestureScore, isLoaded, source }
}
