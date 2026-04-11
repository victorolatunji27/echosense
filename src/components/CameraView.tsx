import { useEffect, useRef } from 'react'
import { useCamera } from '../hooks/useCamera'

interface Props {
  landmarks: Array<{ x: number; y: number; z: number }> | null
  gestureName: string | null
  onReady: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => void
}

export function CameraView({ landmarks: _landmarks, gestureName: _gestureName, onReady }: Props) {
  const { videoRef, isReady, error } = useCamera()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (isReady && videoRef.current && canvasRef.current) {
      onReady(videoRef.current, canvasRef.current)
    }
  }, [isReady])

  return (
    <div
      style={{
        position: 'relative',
        width: '640px',
        height: '480px',
        background: '#000',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {error ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f87171',
            fontSize: '14px',
            padding: '16px',
            textAlign: 'center',
          }}
        >
          {error}
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
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          />
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
              }}
            >
              Starting camera...
            </div>
          )}
        </>
      )}
    </div>
  )
}
