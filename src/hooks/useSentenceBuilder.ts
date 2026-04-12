import { useState, useRef, useCallback } from 'react'
import { lexSigns } from '../utils/signLexer'
import { parseSigns } from '../utils/signParser'
import { evaluateToSentence } from '../utils/sentenceEvaluator'

const AUTO_COMMIT_MS = 3000

export function useSentenceBuilder() {
  const signBuffer = useRef<string[]>([])
  const lastSignTime = useRef<number>(0)
  const autoCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [currentSentence, setCurrentSentence] = useState<string>('')
  const [sentenceHistory, setSentenceHistory] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [bufferDisplay, setBufferDisplay] = useState<string[]>([])

  // Kept in a ref so the auto-commit closure always sees the current value
  const isProcessingRef = useRef(false)

  const buildSentence = useCallback(async () => {
    if (signBuffer.current.length === 0) return
    if (isProcessingRef.current) return

    isProcessingRef.current = true
    setIsProcessing(true)

    try {
      const tokens = lexSigns(signBuffer.current)
      if (tokens.length === 0) return

      const parsed = parseSigns(tokens)
      const sentence = await evaluateToSentence(parsed, signBuffer.current)

      setCurrentSentence(sentence)
      setSentenceHistory((prev) => [...prev, sentence])

      signBuffer.current = []
      setBufferDisplay([])
    } catch (err) {
      console.error('[useSentenceBuilder] build failed:', err)
    } finally {
      isProcessingRef.current = false
      setIsProcessing(false)
    }
  }, [])

  const addSign = useCallback(
    (gestureKey: string) => {
      signBuffer.current.push(gestureKey)
      lastSignTime.current = Date.now()

      // Update the visual token display immediately
      const tokens = lexSigns(signBuffer.current)
      setBufferDisplay(tokens.map((t) => t.value))

      // Reset the auto-commit timer on every new sign
      if (autoCommitTimer.current !== null) {
        clearTimeout(autoCommitTimer.current)
      }
      autoCommitTimer.current = setTimeout(() => {
        if (
          Date.now() - lastSignTime.current >= AUTO_COMMIT_MS - 200 &&
          signBuffer.current.length > 0 &&
          !isProcessingRef.current
        ) {
          buildSentence()
        }
      }, AUTO_COMMIT_MS)
    },
    [buildSentence],
  )

  const clearSentences = useCallback(() => {
    if (autoCommitTimer.current !== null) {
      clearTimeout(autoCommitTimer.current)
    }
    signBuffer.current = []
    setBufferDisplay([])
    setCurrentSentence('')
    setSentenceHistory([])
  }, [])

  return {
    addSign,
    buildSentence,
    currentSentence,
    sentenceHistory,
    isProcessing,
    bufferDisplay,
    clearSentences,
  }
}
