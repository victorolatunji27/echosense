import * as tf from '@tensorflow/tfjs'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  CNN_MODEL_PATH,
  CNN_LABELS,
  CNN_CONFIDENCE_THRESHOLD,
} from '../utils/modelConfig'
import type { Landmark } from '../utils/aslClassifier'

export type CNNPrediction = {
  label: string
  confidence: number
  gestureKey: string // e.g. "ASL_A"
}

/**
 * Padded square bounding box around the hand landmarks, in coordinates
 * normalized to the frame ([y1, x1, y2, x2], the order cropAndResize
 * expects). The box is squared in *pixel* space so the crop matches the
 * training data's aspect ratio (square hand images), then clamped to
 * the frame.
 */
export function computeHandCropBox(
  landmarks: Landmark[],
  videoWidth: number,
  videoHeight: number,
): [number, number, number, number] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x
    if (lm.x > maxX) maxX = lm.x
    if (lm.y < minY) minY = lm.y
    if (lm.y > maxY) maxY = lm.y
  }

  // Work in pixels so "square" means square on screen
  let x1 = minX * videoWidth
  let x2 = maxX * videoWidth
  let y1 = minY * videoHeight
  let y2 = maxY * videoHeight

  // Pad 25% of the larger side — the training images include wrist and
  // some background around the hand
  const pad = 0.25 * Math.max(x2 - x1, y2 - y1)
  x1 -= pad; x2 += pad; y1 -= pad; y2 += pad

  // Square-ify around the center
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2
  const half = Math.max(x2 - x1, y2 - y1) / 2
  x1 = cx - half; x2 = cx + half
  y1 = cy - half; y2 = cy + half

  // Clamp to the frame and re-normalize
  return [
    Math.max(0, y1 / videoHeight),
    Math.max(0, x1 / videoWidth),
    Math.min(1, y2 / videoHeight),
    Math.min(1, x2 / videoWidth),
  ]
}

export function useCNNClassifier() {
  const modelRef = useRef<tf.LayersModel | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState(false)

  // Load model on mount — but only if the model file exists.
  // If it 404s, set isAvailable = false and continue silently.
  // The app uses the geometric classifier as fallback.
  useEffect(() => {
    async function loadModel() {
      try {
        // Check if model file exists before trying to load it
        const res = await fetch(CNN_MODEL_PATH, { method: 'HEAD' })
        if (!res.ok) {
          // Model not trained yet — use geometric classifier fallback
          setIsAvailable(false)
          return
        }

        const model = await tf.loadLayersModel(CNN_MODEL_PATH)

        // Warm up with a dummy input to avoid first-inference latency
        const dummyInput = tf.zeros([1, 224, 224, 3])
        const warmup = model.predict(dummyInput) as tf.Tensor
        warmup.dispose()
        dummyInput.dispose()

        modelRef.current = model
        setIsLoaded(true)
        setIsAvailable(true)
      } catch (err) {
        setLoadError('CNN model failed to load: ' + (err as Error).message)
        setIsAvailable(false)
      }
    }
    loadModel()

    return () => {
      modelRef.current?.dispose()
    }
  }, [])

  // classify() captures the current video frame, crops it to the hand
  // using the MediaPipe landmarks (the model was trained on cropped hand
  // images, not full frames), runs inference, and returns the top
  // prediction.
  const classify = useCallback(
    async (
      videoElement: HTMLVideoElement,
      landmarks: Landmark[],
    ): Promise<CNNPrediction | null> => {
      if (!modelRef.current || !isLoaded) return null
      if (!landmarks || landmarks.length < 21) return null

      const { videoWidth, videoHeight } = videoElement
      if (!videoWidth || !videoHeight) return null

      const box = computeHandCropBox(landmarks, videoWidth, videoHeight)

      // tf.tidy expects a TensorContainer return; we return a plain
      // object, so we do the tensor-heavy work inside tidy and pull
      // the final probabilities out as a number[] before returning.
      const probabilities = tf.tidy<tf.Tensor1D>(() => {
        const frame = tf.browser.fromPixels(videoElement).toFloat().expandDims(0) as tf.Tensor4D
        const cropped = tf.image.cropAndResize(frame, [box], [0], [224, 224])
        // Training used ImageDataGenerator(rescale=1./255) — see
        // model/data_prep.py — so inference must scale to [0, 1] too.
        const normalized = cropped.div(255.0)
        const predictions = modelRef.current!.predict(normalized) as tf.Tensor
        return predictions.squeeze() as tf.Tensor1D
      })

      const probs = Array.from(probabilities.dataSync())
      probabilities.dispose()

      const maxIndex = probs.indexOf(Math.max(...probs))
      const confidence = probs[maxIndex]

      if (confidence < CNN_CONFIDENCE_THRESHOLD) return null

      const rawLabel = CNN_LABELS[maxIndex]
      // Skip non-sign classes
      if (rawLabel === 'NOTHING' || rawLabel === 'DELETE') return null

      return {
        label: rawLabel,
        confidence,
        gestureKey: rawLabel === 'SPACE' ? 'ASL_SPACE' : `ASL_${rawLabel}`,
      }
    },
    [isLoaded]
  )

  return { classify, isLoaded, isAvailable, loadError }
}
