import { useState, useRef, useCallback, useEffect } from 'react'
import { lexSigns } from '../utils/signLexer'
import { parseSigns } from '../utils/signParser'
import type { NonManualMarker } from '../utils/modelConfig'
import {
  evaluateToSentence,
  getTerpAISuggestions,
  type TerpAISuggestion,
} from '../utils/sentenceEvaluator'

const AUTO_COMMIT_MS = 3000
const HAND_DROP_GRACE_MS = 4000
const RELEASE_DELAY_MS = 800

export function formatStopwatch(s: number): string {
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`
}

export function useSentenceBuilder(getAccessToken?: () => Promise<string | undefined>) {
  const signBuffer = useRef<string[]>([])
  // Latches the last non-statement non-manual marker seen during the
  // current utterance. In ASL the facial marker is a prosodic overlay
  // spanning the clause, so one marker applies to the whole buffered
  // utterance rather than a single sign.
  const utteranceMarker = useRef<NonManualMarker | null>(null)
  const lastSignTime = useRef<number>(0)
  const autoCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handDropTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the access-token getter in a ref so prepareSentence can
  // fetch a fresh token each call without widening the dep array.
  const getTokenRef = useRef(getAccessToken)
  useEffect(() => { getTokenRef.current = getAccessToken }, [getAccessToken])

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

  // ── TerpAI conversation monitor ───────────────────────────────────
  const conversationHistory = useRef<string[]>([])
  const prepareRawTokens = useRef<string[]>([])
  const [suggestions, setSuggestions] = useState<TerpAISuggestion[]>([])
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false)

  const triggerSuggestions = useCallback(
    async (sentence: string, rawTokens: string[]) => {
      setIsSuggestionsLoading(true)
      setSuggestions([])

      let token: string | undefined
      if (getTokenRef.current) {
        try { token = await getTokenRef.current() } catch { /* not logged in */ }
      }

      try {
        const results = await getTerpAISuggestions(
          sentence,
          conversationHistory.current,
          rawTokens,
          token,
        )
        setSuggestions(results)
      } catch (err) {
        console.warn('[useSentenceBuilder] suggestions fetch failed:', err)
      } finally {
        setIsSuggestionsLoading(false)
      }
    },
    [],
  )

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

  // PHASE 2: Move pending → current, add to history, clear buffer,
  // and fire a TerpAI suggestions request asynchronously.
  const releaseSentence = useCallback(() => {
    let released = ''
    setPendingSentence((pending) => {
      if (!pending) return ''
      released = pending
      setCurrentSentence(pending)
      setSentenceHistory((prev) => [...prev, pending])
      signBuffer.current = []
      utteranceMarker.current = null
      setBufferDisplay([])
      // Stop the stopwatch — keep sessionSeconds visible
      stopStopwatch()
      return ''
    })

    if (!released) return

    // Append to TerpAI conversation memory (cap at 20 to limit token bloat)
    const next = [...conversationHistory.current, released]
    conversationHistory.current = next.length > 20 ? next.slice(-20) : next

    // Fire suggestions async — don't block the UI. Use the raw tokens
    // captured during prepareSentence, since signBuffer is already cleared.
    const rawTokens = [...prepareRawTokens.current]
    triggerSuggestions(released, rawTokens)
  }, [stopStopwatch, triggerSuggestions])

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

      // Snapshot raw tokens BEFORE the buffer is cleared in releaseSentence.
      // TerpAI needs the original gestureKeys for its conversation context.
      prepareRawTokens.current = [...signBuffer.current]

      const parsed = parseSigns(tokens, utteranceMarker.current)

      // Auth0 — grab an access token if the user is logged in
      let token: string | undefined
      if (getTokenRef.current) {
        try { token = await getTokenRef.current() } catch { /* not logged in */ }
      }

      const sentence = await evaluateToSentence(parsed, token)

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
    (gestureKey: string, marker: NonManualMarker | null = null) => {
      signBuffer.current.push(gestureKey)
      // Latch a non-statement facial marker for the whole utterance.
      if (marker && marker !== 'statement') {
        utteranceMarker.current = marker
      }
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
    utteranceMarker.current = null
    conversationHistory.current = []
    prepareRawTokens.current = []
    setBufferDisplay([])
    setCurrentSentence('')
    setPendingSentence('')
    setSentenceHistory([])
    setSuggestions([])
    setIsSuggestionsLoading(false)
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
    suggestions,
    isSuggestionsLoading,
    getConversationHistory: () => conversationHistory.current,
  }
}
