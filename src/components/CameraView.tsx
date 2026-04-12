import { useEffect, useRef, useState } from 'react'
import { useCamera } from '../hooks/useCamera'

const CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
]

const ARC_R = 32
const ARC_CIRC = 2 * Math.PI * ARC_R // 201.06

interface Props {
  landmarks: Array<{ x: number; y: number; z: number }> | null
  gestureName: string | null
  isLoaded: boolean
  holdProgress: number
  currentLetter: string
  onReady: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => void
}

export function CameraView({ landmarks, gestureName, isLoaded, holdProgress, currentLetter, onReady }: Props) {
  const { videoRef, isReady, error } = useCamera()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Arc fade-out after commit
  const [arcVisible, setArcVisible] = useState(false)
  const [arcOpacity, setArcOpacity] = useState(1)
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (holdProgress > 0) {
      setArcVisible(true)
      setArcOpacity(1)
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    } else if (arcVisible) {
      // Progress dropped to 0 — fade out
      fadeTimer.current = setTimeout(() => setArcOpacity(0), 200)
      hideTimer.current = setTimeout(() => setArcVisible(false), 500)
    }
  }, [holdProgress])

  useEffect(() => {
    if (isReady && videoRef.current && canvasRef.current) {
      onReady(videoRef.current, canvasRef.current)
    }
  }, [isReady])

  // Draw landmarks on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!landmarks) return

    const w = canvas.width
    const h = canvas.height

    ctx.strokeStyle = 'rgba(26,77,58,0.7)'
    ctx.lineWidth = 2
    for (const [a, b] of CONNECTIONS) {
      const p1 = landmarks[a]
      const p2 = landmarks[b]
      if (!p1 || !p2) continue
      ctx.beginPath()
      ctx.moveTo(p1.x * w, p1.y * h)
      ctx.lineTo(p2.x * w, p2.y * h)
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(200,169,110,0.9)'
    for (const lm of landmarks) {
      ctx.beginPath()
      ctx.arc(lm.x * w, lm.y * h, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [landmarks])

  const handActive = landmarks !== null
  const progress = arcVisible ? holdProgress : 0

  return (
    <div className={`camera-container${handActive ? ' hand-active' : ''}`}>
      {error ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '32px',
            textAlign: 'center',
            background: '#1C1A18',
          }}
        >
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="12" width="40" height="28" rx="5" stroke="rgba(192,57,43,0.7)" strokeWidth="2.5"/>
            <circle cx="24" cy="26" r="7" stroke="rgba(192,57,43,0.7)" strokeWidth="2.5"/>
            <line x1="8" y1="8" x2="40" y2="40" stroke="rgba(192,57,43,0.7)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <div style={{ fontSize: '15px', fontWeight: 500, color: '#F0A876' }}>
            Camera access blocked
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', maxWidth: '280px', lineHeight: 1.6 }}>
            Click the camera icon in your browser's address bar and select Allow, then try again.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '4px',
              padding: '9px 22px',
              borderRadius: 'var(--r-md)',
              background: 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            Try Again
          </button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          />

          {/* Gesture label pill */}
          {gestureName && gestureName !== 'None' && (
            <div
              style={{
                position: 'absolute',
                top: '10px',
                left: '12px',
                background: 'rgba(26,77,58,0.85)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 500,
                padding: '3px 9px',
                borderRadius: 'var(--r-pill)',
                backdropFilter: 'blur(4px)',
                letterSpacing: '0.03em',
                zIndex: 2,
              }}
            >
              {gestureName}
            </div>
          )}

          {/* ── Hold progress arc (FIX 2) ──────────────────────────── */}
          {arcVisible && (
            <div
              style={{
                position: 'absolute',
                bottom: '80px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 3,
                pointerEvents: 'none',
                opacity: arcOpacity,
                transition: 'opacity 0.3s ease',
              }}
            >
              <svg width="80" height="80" viewBox="0 0 80 80">
                {/* Background ring */}
                <circle
                  cx="40" cy="40" r={ARC_R}
                  fill="none"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="3"
                />
                {/* Progress arc */}
                <circle
                  cx="40" cy="40" r={ARC_R}
                  fill="none"
                  stroke="#C8A96E"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={ARC_CIRC}
                  strokeDashoffset={ARC_CIRC * (1 - progress)}
                  transform="rotate(-90 40 40)"
                  style={{ transition: 'stroke-dashoffset 40ms linear' }}
                />
                {/* Center content */}
                {progress > 0 && progress < 1 && (
                  <text
                    x="40" y="44"
                    textAnchor="middle"
                    fontSize="18"
                    fontFamily="DM Serif Display, Georgia, serif"
                    fill="white"
                    fontWeight="400"
                  >
                    {currentLetter || ''}
                  </text>
                )}
                {progress >= 1 && (
                  <text
                    x="40" y="46"
                    textAnchor="middle"
                    fontSize="22"
                    fill="#C8A96E"
                  >
                    ✓
                  </text>
                )}
                {/* Outer pulse ring at near-completion */}
                {progress >= 0.95 && (
                  <circle
                    cx="40" cy="40" r="36"
                    fill="none"
                    stroke="rgba(200,169,110,0.4)"
                    strokeWidth="1.5"
                    style={{
                      animation: 'pulseRing 0.4s ease-out forwards',
                    }}
                  />
                )}
              </svg>
            </div>
          )}

          {/* Camera starting */}
          {!isReady && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#1C1A18',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    border: '2px solid rgba(26,77,58,0.3)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Starting camera…</span>
              </div>
            </div>
          )}

          {/* Model loading */}
          {!isLoaded && isReady && (
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(28,26,24,0.75)',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '11px',
                padding: '4px 12px',
                borderRadius: 'var(--r-pill)',
                backdropFilter: 'blur(4px)',
                whiteSpace: 'nowrap',
              }}
            >
              Loading model…
            </div>
          )}
        </>
      )}
    </div>
  )
}
