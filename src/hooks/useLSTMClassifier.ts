import * as tf from '@tensorflow/tfjs'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  LSTM_MODEL_PATH,
  LSTM_LABELS,
  LSTM_CONFIDENCE_THRESHOLD,
  LSTM_SEQUENCE_LENGTH,
  LSTM_MIN_MOTION,
  LANDMARK_FEATURE_COUNT,
} from '../utils/modelConfig'
import type { Landmark } from '../utils/aslClassifier'

/**
 * Mean frame-to-frame landmark displacement across the buffer, in
 * normalized coordinates. Static holds measure ~0.005; deliberate
 * dynamic signs measure >= 0.009 on recorded data.
 */
export function sequenceMotion(buffer: Landmark[][]): number {
  let total = 0
  let count = 0
  for (let f = 1; f < buffer.length; f++) {
    const prev = buffer[f - 1]
    const curr = buffer[f]
    for (let i = 0; i < curr.length; i++) {
      const dx = curr[i].x - prev[i].x
      const dy = curr[i].y - prev[i].y
      const dz = curr[i].z - prev[i].z
      total += Math.sqrt(dx * dx + dy * dy + dz * dz)
      count++
    }
  }
  return count > 0 ? total / count : 0
}

export type LSTMPrediction = {
  label: string       // e.g. "hello"
  displayText: string // e.g. "Hello"
  confidence: number
  gestureKey: string  // e.g. "ASL_HELLO"
}

// Maps LSTM label strings to display text and GESTURE_MAP keys
const LSTM_DISPLAY_MAP: Record<string, { display: string; key: string }> = {
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
}

export function useLSTMClassifier() {
  const modelRef = useRef<tf.LayersModel | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isAvailable, setIsAvailable] = useState(false)

  useEffect(() => {
    async function loadModel() {
      try {
        const res = await fetch(LSTM_MODEL_PATH, { method: 'HEAD' })
        if (!res.ok) {
          setIsAvailable(false)
          return
        }

        const model = await tf.loadLayersModel(LSTM_MODEL_PATH)

        // Warm up with a zeroed sequence
        const dummy = tf.zeros([1, LSTM_SEQUENCE_LENGTH, LANDMARK_FEATURE_COUNT])
        const warmup = model.predict(dummy) as tf.Tensor
        warmup.dispose()
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

  // classifySequence() takes 30 frames of landmarks,
  // flattens each frame to 63 features, and runs LSTM inference.
  const classifySequence = useCallback(
    (buffer: Landmark[][]): LSTMPrediction | null => {
      if (!modelRef.current || !isLoaded || buffer.length !== LSTM_SEQUENCE_LENGTH) {
        return null
      }

      // Static hold — not a dynamic sign. Skip the LSTM entirely so a
      // closed-set softmax can't hijack static letters from the CNN.
      if (sequenceMotion(buffer) < LSTM_MIN_MOTION) {
        return null
      }

      // Run the tensor-heavy portion inside tidy; return a plain
      // probabilities tensor we can pull data off after disposal.
      const probabilitiesTensor = tf.tidy<tf.Tensor1D>(() => {
        const flat = buffer.map((frame) =>
          frame.flatMap((lm) => [lm.x, lm.y, lm.z])
        )
        const input = tf.tensor3d([flat])
        const predictions = modelRef.current!.predict(input) as tf.Tensor
        return predictions.squeeze() as tf.Tensor1D
      })

      const probs = Array.from(probabilitiesTensor.dataSync())
      probabilitiesTensor.dispose()

      const maxIndex = probs.indexOf(Math.max(...probs))
      const confidence = probs[maxIndex]

      if (confidence < LSTM_CONFIDENCE_THRESHOLD) return null

      const label = LSTM_LABELS[maxIndex]
      const mapped = LSTM_DISPLAY_MAP[label]

      if (!mapped) return null

      return {
        label,
        displayText: mapped.display,
        confidence,
        gestureKey: mapped.key,
      }
    },
    [isLoaded]
  )

  return { classifySequence, isLoaded, isAvailable }
}
