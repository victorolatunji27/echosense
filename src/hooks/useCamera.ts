import { useEffect, useRef, useState } from 'react'

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    const video = videoRef.current

    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 } })
      .then((s) => {
        stream = s
        if (videoRef.current) {
          videoRef.current.srcObject = s
          videoRef.current.addEventListener('loadeddata', () => setIsReady(true), { once: true })
        }
      })
      .catch(() => {
        setError('Camera access denied — allow permissions and refresh')
      })

    return () => {
      stream?.getTracks().forEach((t) => t.stop())
      if (video) {
        video.srcObject = null
      }
    }
  }, [])

  return { videoRef, isReady, error }
}
