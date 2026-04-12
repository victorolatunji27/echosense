import { useState, useRef, useCallback, useEffect } from 'react'
import { lexSigns } from '../utils/signLexer'
import { parseSigns } from '../utils/signParser'
import { evaluateToSentence } from '../utils/sentenceEvaluator'

const AUTO_COMMIT_MS = 3000
const HAND_DROP_GRACE_MS = 4000
const RELEASE_DELAY_MS = 800

export function formatStopwatch(s: number): string {
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
}

export function useSentenceBuilder() {
  const signBuffer = useRef<string[]>([])
  const lastSignTime = useRef<number>(0)
  const autoCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handDropTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stopwatch
  const sessionStartTime = useRef<number | null>(null)
  const stopwatchInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const [sessionSeconds, setSessionSeconds] = useState(0)
  const [isTiming, setIsTiming] = useState(false)

  const [currentSentence, setCurrentSentence] = useState('')
  const [pendingSentence, setPendingSentence] = useState('')
  const [sentenceHistory, setSentenceHistory] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [bufferDisplay, setBufferDisplay] = useState<string[]>([])

  const isProcessingRef = useRef(false)

  // ── Stopwatch helpers ──────────────────────────────────────────────
  const stopStopwatch = useCallback(() => {
    setIsTiming(false)
    if (stopwatchInterval.current) {
      clearInterval(stopwatchInterval.current)
      stopwatchInterval.current = null
    }
  }, [])

  const resetStopwatch = useCallback(() => {
    setSessionSeconds(0)
    setIsTiming(false)
    sessionStartTime.current = null
    if (stopwatchInterval.current) {
      clearInterval(stopwatchInterval.current)
      stopwatchInterval.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stopwatchInterval.current) clearInterval(stopwatchInterval.current)
      if (autoCommitTimer.current) clearTimeout(autoCommitTimer.current)
      if (handDropTimer.current) clearTimeout(handDropTimer.current)
      if (releaseTimer.current) clearTimeout(releaseTimer.current)
    }
  }, [])

  // PHASE 2: Move pending → current, add to history, clear buffer
  const releaseSentence = useCallback(() => {
    setPendingSentence((pending) => {
      if (!pending) return ''
      setCurrentSentence(pending)
      setSentenceHistory((prev) => [...prev, pending])
      signBuffer.current = []
      setBufferDisplay([])
      // Stop the stopwatch — keep sessionSeconds visible
      stopStopwatch()
      return ''
    })
  }, [stopStopwatch])

  // PHASE 1: Lex → parse → evaluate → store in pending
  const prepareSentence = useCallback(async () => {
    if (signBuffer.current.length === 0) return
    if (isProcessingRef.current) return

    isProcessingRef.current = true
    setIsProcessing(true)

    try {
      const tokens = lexSigns(signBuffer.current)
      if (tokens.length === 0) {
        isProcessingRef.current = false
        setIsProcessing(false)
        return
      }

      const parsed = parseSigns(tokens)
      const sentence = await evaluateToSentence(parsed)

      setPendingSentence(sentence)

      if (releaseTimer.current) clearTimeout(releaseTimer.current)
      releaseTimer.current = setTimeout(releaseSentence, RELEASE_DELAY_MS)
    } catch (err) {
      console.error('[useSentenceBuilder] build failed:', err)
    } finally {
      isProcessingRef.current = false
      setIsProcessing(false)
    }
  }, [releaseSentence])

  const buildSentence = prepareSentence

  const addSign = useCallback(
    (gestureKey: string) => {
      signBuffer.current.push(gestureKey)
      lastSignTime.current = Date.now()

      // ── Stopwatch START on first sign of session ──────────────────
      if (signBuffer.current.length === 1) {
        sessionStartTime.current = Date.now()
        setSessionSeconds(0)
        setIsTiming(true)

        if (stopwatchInterval.current) clearInterval(stopwatchInterval.current)
        stopwatchInterval.current = setInterval(() => {
          if (sessionStartTime.current) {
            const elapsed = Math.floor((Date.now() - sessionStartTime.current) / 1000)
            setSessionSeconds(elapsed)
          }
        }, 1000)
      }

      const tokens = lexSigns(signBuffer.current)
      setBufferDisplay(tokens.map((t) => t.value))

      // TIER 2: Deliberate pause auto-commit
      if (autoCommitTimer.current !== null) {
        clearTimeout(autoCommitTimer.current)
      }
      autoCommitTimer.current = setTimeout(() => {
        if (
          Date.now() - lastSignTime.current >= AUTO_COMMIT_MS - 200 &&
          signBuffer.current.length > 0 &&
          !isProcessingRef.current
        ) {
          prepareSentence()
        }
      }, AUTO_COMMIT_MS)
    },
    [prepareSentence],
  )

  // TIER 1: Hand dropped — start 4s grace
  const onHandDrop = useCallback(() => {
    if (handDropTimer.current) clearTimeout(handDropTimer.current)
    handDropTimer.current = setTimeout(() => {
      if (signBuffer.current.length > 0 && !isProcessingRef.current) {
        prepareSentence()
      }
    }, HAND_DROP_GRACE_MS)
  }, [prepareSentence])

  const onHandReturn = useCallback(() => {
    if (handDropTimer.current) {
      clearTimeout(handDropTimer.current)
      handDropTimer.current = null
    }
  }, [])

  const clearSentences = useCallback(() => {
    if (autoCommitTimer.current !== null) clearTimeout(autoCommitTimer.current)
    if (handDropTimer.current !== null) clearTimeout(handDropTimer.current)
    if (releaseTimer.current !== null) clearTimeout(releaseTimer.current)
    signBuffer.current = []
    setBufferDisplay([])
    setCurrentSentence('')
    setPendingSentence('')
    setSentenceHistory([])
    resetStopwatch()
  }, [resetStopwatch])

  return {
    addSign,
    buildSentence,
    releaseSentence,
    onHandDrop,
    onHandReturn,
    currentSentence,
    pendingSentence,
    sentenceHistory,
    isProcessing,
    bufferDisplay,
    clearSentences,
    sessionSeconds,
    isTiming,
  }
}
