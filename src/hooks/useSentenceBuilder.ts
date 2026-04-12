import { useState, useRef, useCallback } from 'react'
import { lexSigns } from '../utils/signLexer'
import { parseSigns } from '../utils/signParser'
import { evaluateToSentence } from '../utils/sentenceEvaluator'

const AUTO_COMMIT_MS = 3000
const HAND_DROP_GRACE_MS = 4000
const RELEASE_DELAY_MS = 800

export function useSentenceBuilder() {
  const signBuffer = useRef<string[]>([])
  const lastSignTime = useRef<number>(0)
  const autoCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handDropTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [currentSentence, setCurrentSentence] = useState('')
  const [pendingSentence, setPendingSentence] = useState('')
  const [sentenceHistory, setSentenceHistory] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [bufferDisplay, setBufferDisplay] = useState<string[]>([])

  const isProcessingRef = useRef(false)

  // PHASE 2: Move pending → current, add to history, clear buffer
  const releaseSentence = useCallback(() => {
    setPendingSentence((pending) => {
      if (!pending) return ''
      setCurrentSentence(pending)
      setSentenceHistory((prev) => [...prev, pending])
      signBuffer.current = []
      setBufferDisplay([])
      return ''
    })
  }, [])

  // PHASE 1: Lex → parse → evaluate → store in pending (not current yet)
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
      const sentence = await evaluateToSentence(parsed, signBuffer.current)

      setPendingSentence(sentence)

      // Auto-release after a brief hold so the user can see the result
      if (releaseTimer.current) clearTimeout(releaseTimer.current)
      releaseTimer.current = setTimeout(releaseSentence, RELEASE_DELAY_MS)
    } catch (err) {
      console.error('[useSentenceBuilder] build failed:', err)
    } finally {
      isProcessingRef.current = false
      setIsProcessing(false)
    }
  }, [releaseSentence])

  // Public alias — manual "Build sentence" button calls this
  const buildSentence = prepareSentence

  const addSign = useCallback(
    (gestureKey: string) => {
      signBuffer.current.push(gestureKey)
      lastSignTime.current = Date.now()

      // Update visual token display
      const tokens = lexSigns(signBuffer.current)
      setBufferDisplay(tokens.map((t) => t.value))

      // TIER 2: Deliberate pause — hand stays up but no new sign for 3s
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

  // TIER 1: Hand dropped — start 4s grace period
  const onHandDrop = useCallback(() => {
    if (handDropTimer.current) clearTimeout(handDropTimer.current)
    handDropTimer.current = setTimeout(() => {
      if (signBuffer.current.length > 0 && !isProcessingRef.current) {
        prepareSentence()
      }
    }, HAND_DROP_GRACE_MS)
  }, [prepareSentence])

  // Hand returned — cancel any pending drop timer
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
  }, [])

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
  }
}
