import { useEffect, useRef } from 'react'
import { useCamera } from '../hooks/useCamera'

const CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
]

interface Props {
  landmarks: Array<{ x: number; y: number; z: number }> | null
  gestureName: string | null
  isLoaded: boolean
  onReady: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => void
}

export function CameraView({ landmarks, gestureName, isLoaded, onReady }: Props) {
  const { videoRef, isReady, error } = useCamera()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (isReady && videoRef.current && canvasRef.current) {
      onReady(videoRef.current, canvasRef.current)
    }
  }, [isReady])

  // Draw landmarks and connections on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!landmarks) return

    const w = canvas.width
    const h = canvas.height

    // Draw connections
    ctx.strokeStyle = '#5DCAA5'
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

    // Draw landmark dots
    ctx.fillStyle = '#1D9E75'
    for (const lm of landmarks) {
      ctx.beginPath()
      ctx.arc(lm.x * w, lm.y * h, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [landmarks])

  const hasBorder = landmarks !== null

  return (
    <div
      style={{
        position: 'relative',
        width: '640px',
        height: '480px',
        background: '#000',
        borderRadius: '12px',
        overflow: 'hidden',
        border: hasBorder ? '2px solid rgba(29,158,117,0.5)' : '2px solid transparent',
      }}
    >
      {error ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="12" width="40" height="28" rx="4" stroke="#ef4444" strokeWidth="3"/>
            <circle cx="24" cy="26" r="7" stroke="#ef4444" strokeWidth="3"/>
            <line x1="8" y1="8" x2="40" y2="40" stroke="#ef4444" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#f87171' }}>
            Camera access blocked
          </div>
          <div style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '320px', lineHeight: 1.5 }}>
            Click the camera icon in your browser's address bar and select Allow, then click Try Again below.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '8px',
              padding: '8px 20px',
              borderRadius: '8px',
              background: '#1D9E75',
              color: 'white',
              border: 'none',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
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
          {gestureName && (
            <div
              style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                color: '#ffffff',
                fontSize: '13px',
                pointerEvents: 'none',
              }}
            >
              {gestureName}
            </div>
          )}
          {!isReady && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '14px',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            >
              Starting camera...
            </div>
          )}
          {!isLoaded && isReady && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '13px',
              }}
            >
              Loading gesture model...
            </div>
          )}
        </>
      )}
    </div>
  )
}
