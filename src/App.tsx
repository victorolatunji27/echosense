import { useRef, useState, useEffect, useCallback } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useGestureRecognizer } from './hooks/useGestureRecognizer'
import { useTranscript } from './hooks/useTranscript'
import { useTTS } from './hooks/useTTS'
import { useCNNClassifier } from './hooks/useCNNClassifier'
import { useLSTMClassifier } from './hooks/useLSTMClassifier'
import { useLandmarkBuffer } from './hooks/useLandmarkBuffer'
import { useSentenceBuilder } from './hooks/useSentenceBuilder'
import { getDisplayText, PHRASE_PRIORITY_MAP, isPhraseGesture } from './utils/gestureMap'
import { autocorrectWord } from './utils/spellCorrector'
import { CameraView } from './components/CameraView'
import { OutputPanel } from './components/OutputPanel'
import { SentencePanel } from './components/SentencePanel'
import { GestureFlash } from './components/GestureFlash'
import { PracticeMode } from './components/PracticeMode'
import { ReferenceSheet } from './components/ReferenceSheet'
import { LoaderScreen } from './components/LoaderScreen'
import { CustomCursor } from './components/CustomCursor'
import { AboutModal } from './components/AboutModal'
import { AuthButton } from './components/AuthButton'
import { ASLBackground } from './components/ASLBackground'

const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
]

// Spell mode timing (FIX 1A)
const HOLD_FRAMES = 60     // ~2 seconds at 30fps
const COOLDOWN_FRAMES = 45 // ~1.5 seconds

function App() {
  // Auth0
  const { isAuthenticated, user, getAccessTokenSilently } = useAuth0()

  // Stable getter for the Anthropic call in useSentenceBuilder.
  // Returns undefined if we can't mint a token (e.g. no audience set
  // on the Auth0 app, or the user isn't logged in).
  const getAccessToken = useCallback(async (): Promise<string | undefined> => {
    if (!isAuthenticated) return undefined
    try {
      return await getAccessTokenSilently()
    } catch {
      return undefined
    }
  }, [isAuthenticated, getAccessTokenSilently])

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const cnnClassifier = useCNNClassifier()
  const lstmClassifier = useLSTMClassifier()
  const { addFrame, getBuffer, isReady: isBufferReady, clearBuffer } = useLandmarkBuffer()

  const { landmarks, gestureName, gestureScore, isLoaded } = useGestureRecognizer(
    videoRef as React.RefObject<HTMLVideoElement>,
    {
      cnnClassify: cnnClassifier.classify,
      cnnAvailable: cnnClassifier.isAvailable,
      lstmClassify: lstmClassifier.classifySequence,
      lstmAvailable: lstmClassifier.isAvailable,
      getLandmarkBuffer: getBuffer,
      isBufferReady,
      videoElement: videoRef.current,
    },
  )
  const { transcript, addPhrase, clearTranscript } = useTranscript()
  const { speak, isSpeaking } = useTTS()
  const sentenceBuilder = useSentenceBuilder(getAccessToken)

  const [copied, setCopied] = useState(false)
  const [flashText, setFlashText] = useState<string | null>(null)
  const [practiceMode, setPracticeMode] = useState(false)
  const [sharedTranscriptLoaded, setSharedTranscriptLoaded] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [signCount, setSignCount] = useState(0)
  const [sensitivity, setSensitivity] = useState<'fast' | 'medium' | 'slow'>('medium')
  const [selectedVoiceId, setSelectedVoiceId] = useState(VOICES[0].id)
  const [mode, setMode] = useState<'phrase' | 'spell' | 'sentence'>('phrase')
  const [showAbout, setShowAbout] = useState(false)
  const [showReference, setShowReference] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [isLockedState, setIsLockedState] = useState(false)

  // ── Spell-mode state (FIX 1A, 1B, 1C) ──────────────────────────────
  const [isSpellActive, setIsSpellActive] = useState(false)
  const [currentSpellWord, setCurrentSpellWord] = useState('')
  const [finalizedSpellWord, setFinalizedSpellWord] = useState('')

  const isSpellActiveRef = useRef(false)
  const spellHoldCount = useRef(0)
  const spellCooldown = useRef(0)
  const spellLastGesture = useRef<string | null>(null)
  const spellLocked = useRef(false)

  useEffect(() => { isSpellActiveRef.current = isSpellActive }, [isSpellActive])

  // ── Sentence-mode session state ────────────────────────────────────
  const [isSentenceActive, setIsSentenceActive] = useState(false)
  const isSentenceActiveRef = useRef(false)
  useEffect(() => { isSentenceActiveRef.current = isSentenceActive }, [isSentenceActive])

  // ── TTS toggles (FIX 1E, 2C) ────────────────────────────────────────
  const [spellTTSEnabled, setSpellTTSEnabled] = useState(false)
  const [phraseTTSEnabled, setPhraseTTSEnabled] = useState(false)
  const phraseTTSEnabledRef = useRef(false)
  const lastSpokenPhrase = useRef('')

  useEffect(() => { phraseTTSEnabledRef.current = phraseTTSEnabled }, [phraseTTSEnabled])

  const modeRef = useRef<'phrase' | 'spell' | 'sentence'>('phrase')
  const showReferenceRef = useRef(false)
  const hadLandmarksRef = useRef(false)

  useEffect(() => { showReferenceRef.current = showReference }, [showReference])

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === '?' || (e.key === 'r' && e.ctrlKey)) {
        setShowReference((r) => !r)
      } else if (e.key === 'Escape') {
        if (showReferenceRef.current) {
          setShowReference(false)
        } else {
          clearTranscript()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Load shared transcript from URL on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const encoded = params.get('transcript')
      if (!encoded) return
      const decoded = decodeURIComponent(atob(encoded))
      const lines = decoded.split('\n').filter((line) => line.trim().length > 0)
      if (lines.length === 0) return
      lines.forEach((line) => addPhrase(line))
      setSharedTranscriptLoaded(true)
      setTimeout(() => setSharedTranscriptLoaded(false), 3000)
      window.history.replaceState({}, document.title, window.location.pathname)
    } catch (e) {
      console.warn('Could not parse shared transcript:', e)
    }
  }, [])

  // ── Auth0: load this user's saved transcript on login ─────────────
  const transcriptHydratedRef = useRef(false)
  useEffect(() => {
    if (!isAuthenticated || !user?.sub) return
    if (transcriptHydratedRef.current) return

    const key = `echosense_transcript_${user.sub}`
    const saved = localStorage.getItem(key)
    if (saved) {
      try {
        const lines = JSON.parse(saved) as string[]
        if (Array.isArray(lines)) {
          lines.forEach((line) => addPhrase(line))
        }
      } catch {
        /* ignore malformed data */
      }
    }
    transcriptHydratedRef.current = true
  }, [isAuthenticated, user])

  // ── Auth0: persist the transcript to this user's storage slot ─────
  useEffect(() => {
    if (!isAuthenticated || !user?.sub) return
    if (transcript.length === 0) return
    const key = `echosense_transcript_${user.sub}`
    try {
      localStorage.setItem(key, JSON.stringify(transcript))
    } catch {
      /* quota exceeded / storage blocked — silently ignore */
    }
  }, [transcript, isAuthenticated, user])

  function formatTime(s: number): string {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}m ${sec.toString().padStart(2, '0')}s`
  }

  // Sentence / phrase mode hold threshold (spell has its own)
  const HOLD_THRESHOLD = sensitivity === 'fast' ? 10 : sensitivity === 'slow' ? 30 : 20

  // ── Mode-aware display text ────────────────────────────────────────
  const rawDisplay = getDisplayText(gestureName)
  const phraseDisplay = gestureName ? (PHRASE_PRIORITY_MAP[gestureName] ?? '') : ''
  const displayText =
    mode === 'phrase' ? phraseDisplay :
    mode === 'spell'  ? (isSpellActive && gestureName && /^ASL_[A-Z]$/.test(gestureName) ? gestureName[4] : '') :
                        rawDisplay

  const holdCountRef = useRef(0)
  const lastCommittedRef = useRef('')
  const prevGestureRef = useRef<string | null>(null)

  useEffect(() => {
    holdCountRef.current = 0
  }, [sensitivity])

  // ── Hand drop / return detection (sentence mode) ───────────────────
  useEffect(() => {
    const hasHand = landmarks !== null
    if (!hasHand && hadLandmarksRef.current) {
      if (modeRef.current === 'sentence' && isSentenceActiveRef.current) {
        sentenceBuilder.onHandDrop()
      }
    }
    if (hasHand && !hadLandmarksRef.current) {
      if (modeRef.current === 'sentence' && isSentenceActiveRef.current) {
        sentenceBuilder.onHandReturn()
      }
    }
    hadLandmarksRef.current = hasHand
  }, [landmarks])

  // ── Main frame-by-frame gesture loop ───────────────────────────────
  useEffect(() => {
    addFrame(landmarks)

    // Shared hold counter (phrase + sentence modes)
    if (gestureName === prevGestureRef.current && gestureName !== null && gestureName !== 'None') {
      holdCountRef.current += 1
    } else {
      holdCountRef.current = 0
      // Reset TTS dedup when gesture changes
      if (gestureName !== prevGestureRef.current) {
        lastSpokenPhrase.current = ''
      }
    }
    prevGestureRef.current = gestureName

    // ── SPELL MODE ─────────────────────────────────────────────────
    if (modeRef.current === 'spell') {
      if (!isSpellActiveRef.current) {
        spellHoldCount.current = 0
        spellCooldown.current = 0
        spellLastGesture.current = null
        spellLocked.current = false
        setIsLockedState(false)
        setHoldProgress(0)
        return
      }

      // Tick cooldown first
      if (spellCooldown.current > 0) {
        spellCooldown.current -= 1
        spellLocked.current = true
        setIsLockedState(true)
        setHoldProgress(0)
        if (spellCooldown.current === 0) {
          spellLocked.current = false
          setIsLockedState(false)
        }
        return
      }
      spellLocked.current = false
      setIsLockedState(false)

      const isLetter = !!gestureName && /^ASL_[A-Z]$/.test(gestureName)
      if (!isLetter || !gestureName) {
        spellHoldCount.current = 0
        spellLastGesture.current = null
        setHoldProgress(0)
        return
      }

      // Different gesture than before? Restart count
      if (gestureName !== spellLastGesture.current) {
        spellHoldCount.current = 0
        spellLastGesture.current = gestureName
        setHoldProgress(0)
        return
      }

      spellHoldCount.current += 1
      setHoldProgress(Math.min(spellHoldCount.current / HOLD_FRAMES, 1))

      if (spellHoldCount.current >= HOLD_FRAMES) {
        const letter = gestureName[4]
        setCurrentSpellWord((prev) => prev + letter)
        spellHoldCount.current = 0
        spellLastGesture.current = null
        spellCooldown.current = COOLDOWN_FRAMES
      }
      return
    }

    // ── SENTENCE + PHRASE MODES ────────────────────────────────────
    const progress =
      gestureName && gestureName !== 'None' && gestureName !== 'ASL_NOTHING'
        ? Math.min(holdCountRef.current / HOLD_THRESHOLD, 1)
        : 0
    setHoldProgress(progress)
    setIsLockedState(false)

    const canCommit =
      holdCountRef.current >= HOLD_THRESHOLD &&
      gestureName !== null &&
      gestureName !== 'None' &&
      gestureName !== 'ASL_NOTHING'

    // Sentence mode — bypass displayText dedup; only if session active
    if (canCommit && modeRef.current === 'sentence') {
      if (!isSentenceActiveRef.current) {
        holdCountRef.current = 0
        return
      }
      sentenceBuilder.addSign(gestureName)
      sentenceBuilder.onHandReturn()
      holdCountRef.current = 0
      lastCommittedRef.current = ''
      return
    }

    // Phrase mode — strict gesture filter (FIX 2A, 2B)
    if (modeRef.current === 'phrase') {
      if (!isPhraseGesture(gestureName)) {
        // Silently ignore letters/digits/unknowns
        return
      }
      const phraseText = PHRASE_PRIORITY_MAP[gestureName!] ?? ''
      if (!phraseText) return

      if (canCommit && phraseText !== lastCommittedRef.current) {
        addPhrase(phraseText)
        if (phraseTTSEnabledRef.current && phraseText !== lastSpokenPhrase.current) {
          speak(phraseText, selectedVoiceId)
          lastSpokenPhrase.current = phraseText
        }
        setFlashText(phraseText)
        setSignCount((c) => c + 1)
        lastCommittedRef.current = phraseText
        holdCountRef.current = 0
      }
    }
  }, [gestureName, landmarks])

  useEffect(() => {
    if (flashText === null) return
    const id = setTimeout(() => setFlashText(null), 1500)
    return () => clearTimeout(id)
  }, [flashText])

  function changeMode(m: 'phrase' | 'spell' | 'sentence') {
    modeRef.current = m
    setMode(m)
    holdCountRef.current = 0
    lastCommittedRef.current = ''
    lastSpokenPhrase.current = ''

    // Reset spell state when leaving spell mode
    if (m !== 'spell') {
      setIsSpellActive(false)
      setCurrentSpellWord('')
      setFinalizedSpellWord('')
      spellHoldCount.current = 0
      spellCooldown.current = 0
      spellLastGesture.current = null
      spellLocked.current = false
    }

    // Reset sentence session when leaving sentence mode
    if (m !== 'sentence') {
      setIsSentenceActive(false)
    }
  }

  // ── Sentence session controls ──────────────────────────────────────
  function onSentenceStart() {
    setIsSentenceActive(true)
    holdCountRef.current = 0
    lastCommittedRef.current = ''
  }

  function onSentenceStop() {
    setIsSentenceActive(false)
    // If there's a buffer, build it now. If nothing, just deactivate.
    if (sentenceBuilder.bufferDisplay.length > 0) {
      sentenceBuilder.buildSentence()
    }
  }

  function resetSession() {
    setElapsed(0)
    setSignCount(0)
  }

  function onCopy() {
    navigator.clipboard.writeText(transcript.join(', '))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleShare() {
    if (transcript.length === 0) return
    const raw = transcript.join('\n')
    const encoded = btoa(encodeURIComponent(raw))
    const url = window.location.origin + window.location.pathname + '?transcript=' + encoded
    navigator.clipboard.writeText(url)
  }

  function onReady(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    ;(videoRef as React.MutableRefObject<HTMLVideoElement>).current = video
    ;(canvasRef as React.MutableRefObject<HTMLCanvasElement>).current = canvas
  }

  // ── Spell mode actions (FIX 1B, 1C, 1D) ────────────────────────────
  function onSpellStart() {
    setIsSpellActive(true)
    setCurrentSpellWord('')
    setFinalizedSpellWord('')
    spellHoldCount.current = 0
    spellCooldown.current = 0
    spellLastGesture.current = null
    spellLocked.current = false
  }

  async function onSpellEnd() {
    const raw = currentSpellWord
    setIsSpellActive(false)
    spellHoldCount.current = 0
    spellCooldown.current = 0
    spellLastGesture.current = null
    spellLocked.current = false

    if (!raw) return

    try {
      const corrected = await autocorrectWord(raw)
      setFinalizedSpellWord(corrected)
      addPhrase(corrected)
      setSignCount((c) => c + 1)
      if (spellTTSEnabled && corrected) {
        speak(corrected, selectedVoiceId)
      }
    } catch (err) {
      console.error('[spell finalize] autocorrect failed:', err)
      setFinalizedSpellWord(raw)
    }
  }

  function onSpellClear() {
    setIsSpellActive(false)
    setCurrentSpellWord('')
    setFinalizedSpellWord('')
    spellHoldCount.current = 0
    spellCooldown.current = 0
    spellLastGesture.current = null
    spellLocked.current = false
  }

  // Classifier status
  const classifierStatus =
    cnnClassifier.isAvailable && lstmClassifier.isAvailable
      ? { text: 'CNN + LSTM', color: 'var(--primary)' }
      : cnnClassifier.isAvailable
      ? { text: 'CNN', color: 'var(--primary)' }
      : lstmClassifier.isAvailable
      ? { text: 'LSTM', color: 'var(--primary)' }
      : { text: 'Geometric', color: 'var(--text-3)' }

  // Arc letter (FIX 4B)
  const arcLetter =
    mode === 'spell'
      ? (spellLastGesture.current && /^ASL_[A-Z]$/.test(spellLastGesture.current) ? spellLastGesture.current[4] : '')
      : displayText

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Background watermark — renders at z-index 0 behind everything */}
      <ASLBackground />

      {/* All app content sits in its own stacking context at z-index 1 */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
      <CustomCursor />
      <LoaderScreen isLoaded={isLoaded} />
      <GestureFlash text={flashText} gestureKey={gestureName} />

      {showReference && (
        <ReferenceSheet onClose={() => setShowReference(false)} currentGesture={gestureName} />
      )}

      {practiceMode && (
        <PracticeMode
          currentGesture={gestureName}
          gestureScore={gestureScore}
          onExit={() => setPracticeMode(false)}
        />
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {/* ── Sticky header ─────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          padding: '0 28px',
          height: '72px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(247,245,242,0.92)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '32px',
                fontWeight: 400,
                color: 'var(--text)',
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
              }}
            >
              Echo<span style={{ color: 'var(--primary)' }}>Sense</span>
            </span>
            <span
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '10px',
                color: 'var(--text-3)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              ASL Interpreter
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'var(--primary)',
                animation: isLoaded ? 'pulse 2.5s ease-in-out infinite' : 'none',
              }}
            />
            <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              {isLoaded ? 'Live' : 'Loading'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {landmarks !== null && (
            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 500 }}>
              Hand detected
            </span>
          )}

          <span className="session-stats" style={{ fontSize: '11px', color: 'var(--text-3)' }}>
            {signCount} signs · {formatTime(elapsed)}
          </span>

          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: classifierStatus.color }} />
            <span style={{ fontSize: '10px', color: classifierStatus.color }}>{classifierStatus.text}</span>
          </span>

          <div
            style={{
              display: 'flex',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-pill)',
              padding: '2px',
              gap: '2px',
            }}
          >
            {(['phrase', 'spell', 'sentence'] as const).map((m) => {
              const isActive = mode === m
              return (
                <button
                  key={m}
                  onClick={() => changeMode(m)}
                  style={{
                    fontSize: '11px',
                    padding: '3px 11px',
                    borderRadius: 'var(--r-pill)',
                    border: 'none',
                    background: isActive ? 'var(--primary)' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--text-3)',
                    fontWeight: isActive ? 500 : 400,
                    transition: 'background 0.15s, color 0.15s',
                    textTransform: 'capitalize',
                  }}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              )
            })}
          </div>

          <button
            onClick={() => setShowReference(true)}
            style={{
              fontSize: '11px',
              padding: '4px 13px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-2)',
            }}
          >
            ASL Guide
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Speed
            </span>
            <div
              style={{
                display: 'flex',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-pill)',
                padding: '2px',
                gap: '2px',
              }}
            >
              {(['fast', 'medium', 'slow'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSensitivity(s)}
                  style={{
                    fontSize: '10px',
                    padding: '2px 9px',
                    borderRadius: 'var(--r-pill)',
                    border: 'none',
                    background: sensitivity === s ? 'var(--primary)' : 'transparent',
                    color: sensitivity === s ? '#ffffff' : 'var(--text-3)',
                    transition: 'background 0.15s',
                    textTransform: 'capitalize',
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setPracticeMode(true)}
            style={{
              fontSize: '11px',
              padding: '4px 13px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--primary)',
              background: 'transparent',
              color: 'var(--primary)',
              fontWeight: 500,
            }}
          >
            Practice
          </button>

          <button
            onClick={() => setShowAbout(true)}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: 'var(--r-pill)',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text-3)',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ?
          </button>

          {/* Auth0 */}
          <AuthButton />
        </div>
      </header>

      {/* Shared transcript banner */}
      {sharedTranscriptLoaded && (
        <div
          style={{
            background: 'var(--primary)',
            color: '#ffffff',
            textAlign: 'center',
            padding: '10px 24px',
            fontSize: '13px',
            fontWeight: 500,
            animation: 'fadeUp 0.3s ease-out',
            letterSpacing: '0.01em',
          }}
        >
          Shared transcript loaded — {transcript.length} signs restored
        </div>
      )}

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '20px 24px 32px',
        }}
      >
        <div className="main-grid">
          <CameraView
            landmarks={landmarks}
            gestureName={gestureName}
            isLoaded={isLoaded}
            holdProgress={holdProgress}
            currentLetter={arcLetter}
            isLocked={isLockedState}
            onReady={onReady}
          />

          {mode === 'sentence' ? (
            <SentencePanel
              bufferDisplay={sentenceBuilder.bufferDisplay}
              currentSentence={sentenceBuilder.currentSentence}
              sentenceHistory={sentenceBuilder.sentenceHistory}
              isProcessing={sentenceBuilder.isProcessing}
              sessionSeconds={sentenceBuilder.sessionSeconds}
              isTiming={sentenceBuilder.isTiming}
              isActive={isSentenceActive}
              suggestions={sentenceBuilder.suggestions}
              isSuggestionsLoading={sentenceBuilder.isSuggestionsLoading}
              onStart={onSentenceStart}
              onStop={onSentenceStop}
              onClear={() => { sentenceBuilder.clearSentences(); setIsSentenceActive(false) }}
              onSpeak={(text) => speak(text, selectedVoiceId)}
              currentGesture={gestureName}
              displayText={rawDisplay}
            />
          ) : (
            <OutputPanel
              currentGesture={gestureName}
              displayText={displayText}
              confidence={gestureScore}
              transcript={transcript}
              isSpeaking={isSpeaking}
              copied={copied}
              mode={mode}
              voices={VOICES}
              selectedVoiceId={selectedVoiceId}
              onVoiceChange={setSelectedVoiceId}
              onCopy={onCopy}
              onShare={handleShare}
              onClear={() => {
                clearTranscript()
                resetSession()
                clearBuffer()
                onSpellClear()
                // Also wipe the user's saved transcript so Clear is honest
                if (isAuthenticated && user?.sub) {
                  try { localStorage.removeItem(`echosense_transcript_${user.sub}`) } catch { /* ignore */ }
                }
              }}
              onOpenReference={() => setShowReference(true)}
              isAuthenticated={isAuthenticated}
              phraseTTSEnabled={phraseTTSEnabled}
              onPhraseTTSChange={setPhraseTTSEnabled}
              isSpellActive={isSpellActive}
              currentSpellWord={currentSpellWord}
              finalizedSpellWord={finalizedSpellWord}
              spellLocked={isLockedState && mode === 'spell'}
              spellTTSEnabled={spellTTSEnabled}
              onSpellTTSChange={setSpellTTSEnabled}
              onSpellStart={onSpellStart}
              onSpellEnd={onSpellEnd}
              onSpellClear={onSpellClear}
            />
          )}
        </div>
      </main>
      </div>
    </div>
  )
}

export default App
