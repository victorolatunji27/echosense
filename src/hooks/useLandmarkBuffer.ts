import { useRef, useCallback } from 'react'
import type { Landmark } from '../utils/aslClassifier'
import { LSTM_SEQUENCE_LENGTH, FRAME_FEATURE_COUNT } from '../utils/modelConfig'

export function useLandmarkBuffer() {
  const buffer = useRef<Landmark[][]>([])
  const wideBuffer = useRef<number[][]>([])

  // Legacy single-hand path — unchanged. This is still what the currently
  // deployed LSTM classifier consumes (see useLSTMClassifier.classifySequence),
  // fed the primary-hand landmarks from useGestureRecognizer.
  const addFrame = useCallback((landmarks: Landmark[] | null) => {
    if (!landmarks) {
      // No hand detected — clear buffer so LSTM doesn't classify across a gap
      buffer.current = []
      return
    }
    buffer.current.push(landmarks)
    // Keep only the last LSTM_SEQUENCE_LENGTH frames
    if (buffer.current.length > LSTM_SEQUENCE_LENGTH) {
      buffer.current = buffer.current.slice(-LSTM_SEQUENCE_LENGTH)
    }
  }, [])

  const getBuffer = useCallback((): Landmark[][] => buffer.current, [])

  const isReady = useCallback(
    (): boolean => buffer.current.length === LSTM_SEQUENCE_LENGTH,
    []
  )

  // ── Wide (two-hand + face) buffer ───────────────────────────────────────
  //
  // Plumbing only — no model consumes FRAME_FEATURE_COUNT-wide frames yet
  // (see modelConfig.ts). Gated at the call site (App.tsx) behind
  // ENABLE_WIDE_CAPTURE so it can be switched off with zero cost.
  const addWideFrame = useCallback((vector: number[] | null) => {
    if (!vector) {
      wideBuffer.current = []
      return
    }
    if (import.meta.env.DEV && vector.length !== FRAME_FEATURE_COUNT) {
      console.error(
        `[useLandmarkBuffer] wide frame vector length ${vector.length}, expected ${FRAME_FEATURE_COUNT}`,
      )
    }
    wideBuffer.current.push(vector)
    if (wideBuffer.current.length > LSTM_SEQUENCE_LENGTH) {
      wideBuffer.current = wideBuffer.current.slice(-LSTM_SEQUENCE_LENGTH)
    }
  }, [])

  const getWideBuffer = useCallback((): number[][] => wideBuffer.current, [])

  const isWideReady = useCallback(
    (): boolean => wideBuffer.current.length === LSTM_SEQUENCE_LENGTH,
    []
  )

  const clearBuffer = useCallback(() => {
    buffer.current = []
    wideBuffer.current = []
  }, [])

  return {
    addFrame,
    getBuffer,
    isReady,
    clearBuffer,
    addWideFrame,
    getWideBuffer,
    isWideReady,
  }
}
