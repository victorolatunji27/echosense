import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraErrorKind = 'denied' | 'not-found' | 'in-use' | 'unknown'

function classifyCameraError(err: unknown): CameraErrorKind {
  const name = err instanceof DOMException ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'not-found'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'in-use'
    default:
      return 'unknown'
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<CameraErrorKind | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Re-request the camera without a full page reload
  const retry = useCallback(() => {
    setError(null)
    setIsReady(false)
    setAttempt((a) => a + 1)
  }, [])

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    const video = videoRef.current

    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.addEventListener('loadeddata', () => setIsReady(true), { once: true })
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(classifyCameraError(err))
      })

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
      if (video) {
        video.srcObject = null
      }
    }
  }, [attempt])

  return { videoRef, isReady, error, retry }
}
