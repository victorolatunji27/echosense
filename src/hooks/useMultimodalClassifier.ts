import * as tf from '@tensorflow/tfjs'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  MULTIMODAL_MODEL_PATH,
  MULTIMODAL_SIGN_LABELS,
  NMM_LABELS,
  MULTIMODAL_SIGN_THRESHOLD,
  MULTIMODAL_MARKER_THRESHOLD,
  LSTM_SEQUENCE_LENGTH,
  LSTM_MIN_MOTION,
  FRAME_FEATURE_COUNT,
  TWO_HAND_FEATURE_COUNT,
  type NonManualMarker,
} from '../utils/modelConfig'

export type MultimodalPrediction = {
  sign: string              // e.g. "help"
  displayText: string       // e.g. "Help"
  gestureKey: string        // e.g. "ASL_HELP"
  signConfidence: number
  marker: NonManualMarker   // facial grammar; 'statement' when uncertain
  markerConfidence: number
}

// Maps manual-sign labels to display text and GESTURE_MAP keys. Signs
// without an entry (notably the 'other' rejection class) are discarded.
const SIGN_DISPLAY_MAP: Record<string, { display: string; key: string }> = {
  hello:      { display: 'Hello',      key: 'Victory' },
  thank_you:  { display: 'Thank you',  key: 'ASL_THANKYOU' },
  please:     { display: 'Please',     key: 'ASL_PLEASE' },
  sorry:      { display: 'Sorry',      key: 'ASL_SORRY' },
  help:       { display: 'Help',       key: 'ASL_HELP' },
  more:       { display: 'More',       key: 'ASL_MORE' },
  finished:   { display: 'Finished',   key: 'ASL_FINISHED' },
  want:       { display: 'Want',       key: 'ASL_WANT' },
  understand: { display: 'Understand', key: 'ASL_UNDERSTAND' },
  where:      { display: 'Where?',     key: 'ASL_WHERE' },
  name:       { display: 'Name',       key: 'ASL_NAME' },
  pain:       { display: 'Pain',       key: 'ASL_PAIN' },
  water:      { display: 'Water',      key: 'ASL_WATER' },
  eat:        { display: 'Eat',        key: 'ASL_EAT' },
  friend:     { display: 'Friend',     key: 'ASL_FRIEND' },
  you:        { display: 'You',        key: 'ASL_YOU' },
  go:         { display: 'Go',         key: 'ASL_GO' },
}

/**
 * Mean frame-to-frame displacement over the HAND portion of the wide
 * vector (first TWO_HAND_FEATURE_COUNT dims). Face blendshapes are
 * excluded — a still hand with an active face is still a static hold and
 * should defer to the CNN. Mirrors sequenceMotion in useLSTMClassifier.
 */
export function wideSequenceMotion(buffer: number[][]): number {
  let total = 0
  let count = 0
  for (let f = 1; f < buffer.length; f++) {
    const prev = buffer[f - 1]
    const curr = buffer[f]
    // 126 hand dims = 42 landmark points × (x, y, z)
    for (let i = 0; i < TWO_HAND_FEATURE_COUNT; i += 3) {
      const dx = curr[i] - prev[i]
      const dy = curr[i + 1] - prev[i + 1]
      const dz = curr[i + 2] - prev[i + 2]
      total += Math.sqrt(dx * dx + dy * dy + dz * dz)
      count++
    }
  }
  return count > 0 ? total / count : 0
}

export function useMultimodalClassifier() {
  const modelRef = useRef<tf.LayersModel | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isAvailable, setIsAvailable] = useState(false)

  useEffect(() => {
    async function loadModel() {
      try {
        const res = await fetch(MULTIMODAL_MODEL_PATH, { method: 'HEAD' })
        if (!res.ok) {
          setIsAvailable(false)
          return
        }

        const model = await tf.loadLayersModel(MULTIMODAL_MODEL_PATH)

        // Warm up — the model has two output heads
        const dummy = tf.zeros([1, LSTM_SEQUENCE_LENGTH, FRAME_FEATURE_COUNT])
        const warmup = model.predict(dummy) as tf.Tensor | tf.Tensor[]
        ;(Array.isArray(warmup) ? warmup : [warmup]).forEach((t) => t.dispose())
        dummy.dispose()

        modelRef.current = model
        setIsLoaded(true)
        setIsAvailable(true)
      } catch {
        setIsAvailable(false)
      }
    }
    loadModel()

    return () => {
      modelRef.current?.dispose()
    }
  }, [])

  // classifySequence() takes 30 frames of the 138-wide combined vector and
  // runs the dual-head model. Returns the manual sign plus the non-manual
  // marker (facial grammar), or null when below threshold / a static hold /
  // the rejection class.
  const classifySequence = useCallback(
    (wideBuffer: number[][]): MultimodalPrediction | null => {
      if (
        !modelRef.current ||
        !isLoaded ||
        wideBuffer.length !== LSTM_SEQUENCE_LENGTH
      ) {
        return null
      }

      // Static hold — defer to the CNN for one-hand static letters.
      if (wideSequenceMotion(wideBuffer) < LSTM_MIN_MOTION) {
        return null
      }

      const outputs = tf.tidy(() => {
        const input = tf.tensor3d([wideBuffer]) // [1, 30, 138]
        const preds = modelRef.current!.predict(input) as tf.Tensor[]
        // Functional model returns [sign, marker] in definition order.
        return preds.map((t) => Array.from((t.squeeze() as tf.Tensor1D).dataSync()))
      })

      const [signProbs, markerProbs] = outputs

      const signIdx = signProbs.indexOf(Math.max(...signProbs))
      const signConfidence = signProbs[signIdx]
      if (signConfidence < MULTIMODAL_SIGN_THRESHOLD) return null

      const signLabel = MULTIMODAL_SIGN_LABELS[signIdx]
      const mapped = SIGN_DISPLAY_MAP[signLabel]
      if (!mapped) return null // 'other' rejection class, or unmapped

      // Marker head: keep the neutral 'statement' default unless the model
      // is confidently a non-statement marker — a wrong question/negation
      // read flips the sentence meaning.
      const markerIdx = markerProbs.indexOf(Math.max(...markerProbs))
      const markerConfidence = markerProbs[markerIdx]
      const rawMarker = (NMM_LABELS[markerIdx] ?? 'statement') as NonManualMarker
      const marker: NonManualMarker =
        rawMarker !== 'statement' && markerConfidence >= MULTIMODAL_MARKER_THRESHOLD
          ? rawMarker
          : 'statement'

      return {
        sign: signLabel,
        displayText: mapped.display,
        gestureKey: mapped.key,
        signConfidence,
        marker,
        markerConfidence,
      }
    },
    [isLoaded],
  )

  return { classifySequence, isLoaded, isAvailable }
}
