import { useRef, useState, useEffect } from 'react'
import { useGestureRecognizer } from './hooks/useGestureRecognizer'
import { useTranscript } from './hooks/useTranscript'
import { useTTS } from './hooks/useTTS'
import { useCNNClassifier } from './hooks/useCNNClassifier'
import { useLSTMClassifier } from './hooks/useLSTMClassifier'
import { useLandmarkBuffer } from './hooks/useLandmarkBuffer'
import { useSentenceBuilder } from './hooks/useSentenceBuilder'
import { getDisplayText, GESTURE_MAP } from './utils/gestureMap'
import { CameraView } from './components/CameraView'
import { OutputPanel } from './components/OutputPanel'
import { SentencePanel } from './components/SentencePanel'
import { GestureFlash } from './components/GestureFlash'
import { PracticeMode } from './components/PracticeMode'
import { ReferenceSheet } from './components/ReferenceSheet'
import { LoaderScreen } from './components/LoaderScreen'
import { CustomCursor } from './components/CustomCursor'
import { AboutModal } from './components/AboutModal'

const ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_KEY ?? ''

const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
]

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const cnnClassifier = useCNNClassifier()
  const lstmClassifier = useLSTMClassifier()
  const { addFrame, getBuffer, isReady: isBufferReady, clearBuffer } = useLandmarkBuffer()

  const { landmarks, gestureName, gestureScore, isLoaded } = useGestureRecognizer(videoRef, {
    cnnClassify: cnnClassifier.classify,
    cnnAvailable: cnnClassifier.isAvailable,
    lstmClassify: lstmClassifier.classifySequence,
    lstmAvailable: lstmClassifier.isAvailable,
    getLandmarkBuffer: getBuffer,
    isBufferReady,
    videoElement: videoRef.current,
  })
  const { transcript, addPhrase, clearTranscript } = useTranscript()
  const { speak, isSpeaking } = useTTS(ELEVENLABS_KEY)
  const sentenceBuilder = useSentenceBuilder()

  const [copied, setCopied] = useState(false)
  const [flashText, setFlashText] = useState<string | null>(null)
  const [practiceMode, setPracticeMode] = useState(false)
  const [sharedTranscriptLoaded, setSharedTranscriptLoaded] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [signCount, setSignCount] = useState(0)
  const [sensitivity, setSensitivity] = useState<'fast' | 'medium' | 'slow'>('medium')
  const [selectedVoiceId, setSelectedVoiceId] = useState(VOICES[0].id)
  const [mode, setMode] = useState<'phrase' | 'spell' | 'sentence'>('phrase')
  const [currentWord, setCurrentWord] = useState('')
  const [showAbout, setShowAbout] = useState(false)
  const [showReference, setShowReference] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)

  const modeRef = useRef<'phrase' | 'spell' | 'sentence'>('phrase')
  const currentWordRef = useRef('')
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

  function formatTime(s: number): string {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}m ${sec.toString().padStart(2, '0')}s`
  }

  const HOLD_THRESHOLD = sensitivity === 'fast' ? 10 : sensitivity === 'slow' ? 30 : 20
  const displayText = getDisplayText(gestureName)

  const holdCountRef = useRef(0)
  const lastCommittedRef = useRef('')
  const prevGestureRef = useRef<string | null>(null)

  useEffect(() => {
    holdCountRef.current = 0
  }, [sensitivity])

  // ── FIX 1: Hand drop / return detection ────────────────────────────
  useEffect(() => {
    const hasHand = landmarks !== null

    if (!hasHand && hadLandmarksRef.current) {
      // Hand just dropped
      if (modeRef.current === 'sentence') {
        sentenceBuilder.onHandDrop()
      }
    }
    if (hasHand && !hadLandmarksRef.current) {
      // Hand just returned
      if (modeRef.current === 'sentence') {
        sentenceBuilder.onHandReturn()
      }
    }
    hadLandmarksRef.current = hasHand
  }, [landmarks])

  // ── Gesture commit logic ───────────────────────────────────────────
  // Depends on both gestureName AND landmarks so it fires every frame
  useEffect(() => {
    addFrame(landmarks)

    if (gestureName === prevGestureRef.current && gestureName !== null && gestureName !== 'None') {
      holdCountRef.current += 1
    } else {
      holdCountRef.current = 0
    }
    prevGestureRef.current = gestureName

    // FIX 2: Update hold progress for the arc visualization
    const progress = (gestureName && gestureName !== 'None' && gestureName !== 'ASL_NOTHING')
      ? Math.min(holdCountRef.current / HOLD_THRESHOLD, 1)
      : 0
    setHoldProgress(progress)

    const canCommit =
      holdCountRef.current >= HOLD_THRESHOLD &&
      gestureName !== null &&
      gestureName !== 'None' &&
      gestureName !== 'ASL_NOTHING'

    // Sentence mode — bypass displayText dedup for space/consecutive letters
    if (canCommit && modeRef.current === 'sentence') {
      sentenceBuilder.addSign(gestureName)
      sentenceBuilder.onHandReturn() // cancel any pending drop timer
      holdCountRef.current = 0
      lastCommittedRef.current = ''
      return
    }

    // Phrase + Spell modes
    if (canCommit && displayText !== lastCommittedRef.current) {
      if (modeRef.current === 'spell') {
        if (/^ASL_[A-Z]$/.test(gestureName)) {
          const letter = GESTURE_MAP[gestureName] ?? ''
          const newWord = currentWordRef.current + letter
          currentWordRef.current = newWord
          setCurrentWord(newWord)
          lastCommittedRef.current = ''
          holdCountRef.current = 0
        } else if (gestureName === 'Open_Palm') {
          if (currentWordRef.current !== '') {
            addPhrase(currentWordRef.current)
            speak(currentWordRef.current, selectedVoiceId)
            setFlashText(currentWordRef.current)
            setSignCount((c) => c + 1)
            currentWordRef.current = ''
            setCurrentWord('')
          }
          lastCommittedRef.current = displayText
          holdCountRef.current = 0
        } else if (gestureName === 'Closed_Fist') {
          const newWord = currentWordRef.current.slice(0, -1)
          currentWordRef.current = newWord
          setCurrentWord(newWord)
          lastCommittedRef.current = ''
          holdCountRef.current = 0
        } else if (displayText !== '') {
          addPhrase(displayText)
          speak(displayText, selectedVoiceId)
          setFlashText(displayText)
          setSignCount((c) => c + 1)
          lastCommittedRef.current = displayText
          holdCountRef.current = 0
        }
      } else {
        if (displayText !== '') {
          addPhrase(displayText)
          speak(displayText, selectedVoiceId)
          setFlashText(displayText)
          setSignCount((c) => c + 1)
          lastCommittedRef.current = displayText
          holdCountRef.current = 0
        }
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
    currentWordRef.current = ''
    setCurrentWord('')
    lastCommittedRef.current = ''
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

  // Classifier status
  const classifierStatus =
    cnnClassifier.isAvailable && lstmClassifier.isAvailable
      ? { text: 'CNN + LSTM', color: 'var(--primary)' }
      : cnnClassifier.isAvailable
      ? { text: 'CNN', color: 'var(--primary)' }
      : lstmClassifier.isAvailable
      ? { text: 'LSTM', color: 'var(--primary)' }
      : { text: 'Geometric', color: 'var(--text-3)' }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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

      {/* ── Sticky header (FIX 7: 72px, bigger logo) ─────────────── */}
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
        {/* Logo (FIX 7) */}
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

        {/* Controls */}
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

          {/* Mode tabs */}
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

          {/* Speed */}
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

      {/* Main (FIX 6: tighter padding) */}
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
            currentLetter={displayText}
            onReady={onReady}
          />

          {mode === 'sentence' ? (
            <SentencePanel
              bufferDisplay={sentenceBuilder.bufferDisplay}
              currentSentence={sentenceBuilder.currentSentence}
              pendingSentence={sentenceBuilder.pendingSentence}
              sentenceHistory={sentenceBuilder.sentenceHistory}
              isProcessing={sentenceBuilder.isProcessing}
              onBuild={sentenceBuilder.buildSentence}
              onRelease={sentenceBuilder.releaseSentence}
              onClear={sentenceBuilder.clearSentences}
              onSpeak={(text) => speak(text, selectedVoiceId)}
              currentGesture={gestureName}
              displayText={displayText}
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
              currentWord={currentWord}
              voices={VOICES}
              selectedVoiceId={selectedVoiceId}
              onVoiceChange={setSelectedVoiceId}
              onCopy={onCopy}
              onShare={handleShare}
              onClear={() => { clearTranscript(); resetSession(); clearBuffer() }}
              onOpenReference={() => setShowReference(true)}
            />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
