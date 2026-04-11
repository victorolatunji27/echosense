import { useRef, useState, useEffect } from 'react'
import { useGestureRecognizer } from './hooks/useGestureRecognizer'
import { useTranscript } from './hooks/useTranscript'
import { useTTS } from './hooks/useTTS'
import { getDisplayText } from './utils/gestureMap'
import { CameraView } from './components/CameraView'
import { OutputPanel } from './components/OutputPanel'

const ELEVENLABS_KEY = import.meta.env.VITE_ELEVENLABS_KEY ?? ''

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { landmarks, gestureName, gestureScore, isLoaded } = useGestureRecognizer(videoRef)
  const { transcript, addPhrase, clearTranscript } = useTranscript()
  const { speak, isSpeaking } = useTTS(ELEVENLABS_KEY)

  const [copied, setCopied] = useState(false)

  const displayText = getDisplayText(gestureName)

  const holdCountRef = useRef(0)
  const lastCommittedRef = useRef('')
  const prevGestureRef = useRef<string | null>(null)

  // Gesture commit with debounce — hold for 20 frames before adding to transcript
  useEffect(() => {
    if (gestureName === prevGestureRef.current && gestureName !== null && gestureName !== 'None') {
      holdCountRef.current += 1
    } else {
      holdCountRef.current = 0
    }
    prevGestureRef.current = gestureName

    if (
      holdCountRef.current >= 20 &&
      displayText !== '' &&
      displayText !== lastCommittedRef.current
    ) {
      addPhrase(displayText)
      speak(displayText)
      lastCommittedRef.current = displayText
      holdCountRef.current = 0
    }
  }, [gestureName])

  function onCopy() {
    navigator.clipboard.writeText(transcript.join(', '))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function onReady(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    ;(videoRef as React.MutableRefObject<HTMLVideoElement>).current = video
    ;(canvasRef as React.MutableRefObject<HTMLCanvasElement>).current = canvas
  }

  // suppress unused — copied state used for future UI feedback
  void copied

  return (
    <div
      style={{
        background: '#0f172a',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '16px 32px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#ffffff', fontSize: '18px', fontWeight: 500 }}>EchoSense</span>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#1D9E75',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '11px', color: '#1D9E75' }}>Live</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {landmarks !== null && (
            <span style={{ fontSize: '12px', color: '#1D9E75' }}>Hand detected</span>
          )}
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {isLoaded ? 'Model ready' : 'Loading model...'}
          </span>
        </div>
      </header>

      {/* Main */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
        }}
      >
        <div
          className="main-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '640px 1fr',
            gap: '24px',
            alignItems: 'start',
          }}
        >
          {/* Left — Camera */}
          <CameraView
            landmarks={landmarks}
            gestureName={gestureName}
            isLoaded={isLoaded}
            onReady={onReady}
          />

          {/* Right — Output */}
          <OutputPanel
            currentGesture={gestureName}
            displayText={displayText}
            confidence={gestureScore}
            transcript={transcript}
            isSpeaking={isSpeaking}
            copied={copied}
            onCopy={onCopy}
            onClear={clearTranscript}
          />
        </div>
      </main>
    </div>
  )
}

export default App
