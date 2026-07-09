import { useRef, useState, useEffect } from 'react'

/**
 * useTTS — speaks a piece of text aloud.
 *
 * Strategy:
 *   1. Stream MP3 audio from ElevenLabs via the /api/tts serverless
 *      proxy (the API key lives server-side only) and play it through
 *      an <audio> element.
 *   2. On any proxy/ElevenLabs failure (non-2xx response, network
 *      error, audio decode error), fall back to the browser's built-in
 *      SpeechSynthesis API so the user always hears the text.
 *
 * `isSpeaking` reflects *any* active playback, including the Web
 * Speech fallback.
 */
export function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false)

  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  const currentUrlRef = useRef<string | null>(null)

  // Clean up any blob URL and running audio when we're done / replaced
  function cleanupAudio() {
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause()
      } catch { /* ignore */ }
      currentAudioRef.current = null
    }
    if (currentUrlRef.current) {
      try {
        URL.revokeObjectURL(currentUrlRef.current)
      } catch { /* ignore */ }
      currentUrlRef.current = null
    }
  }

  // Unmount safety
  useEffect(() => {
    return () => {
      cleanupAudio()
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try { window.speechSynthesis.cancel() } catch { /* ignore */ }
      }
    }
  }, [])

  function speakWithWebSpeech(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('[useTTS] Web Speech API not available in this browser')
      setIsSpeaking(false)
      return
    }
    try {
      // Cancel any previous utterance so they don't pile up
      window.speechSynthesis.cancel()

      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.95
      u.pitch = 1.0
      u.volume = 1.0
      u.onstart = () => setIsSpeaking(true)
      u.onend = () => setIsSpeaking(false)
      u.onerror = (e) => {
        console.warn('[useTTS] Web Speech error:', e.error)
        setIsSpeaking(false)
      }
      window.speechSynthesis.speak(u)
    } catch (err) {
      console.warn('[useTTS] Web Speech threw:', err)
      setIsSpeaking(false)
    }
  }

  async function speakWithElevenLabs(text: string, voiceId: string): Promise<boolean> {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({ text, voiceId }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.warn(
          `[useTTS] /api/tts ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
        )
        return false
      }

      const buffer = await res.arrayBuffer()
      if (buffer.byteLength === 0) {
        console.warn('[useTTS] /api/tts returned empty buffer')
        return false
      }

      const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/mpeg' }))
      currentUrlRef.current = url

      const audio = new Audio(url)
      currentAudioRef.current = audio

      audio.addEventListener('play', () => setIsSpeaking(true))
      audio.addEventListener('ended', () => {
        setIsSpeaking(false)
        cleanupAudio()
      })

      // Wait for the first playback error or the play promise.
      // If the decoded audio is garbage, .play() rejects OR the error
      // event fires — either way we return false so the caller can
      // fall back to Web Speech.
      let decodeError = false
      audio.addEventListener('error', () => {
        decodeError = true
        setIsSpeaking(false)
        cleanupAudio()
      })

      try {
        await audio.play()
      } catch (playErr) {
        console.warn('[useTTS] audio.play() rejected:', playErr)
        decodeError = true
        setIsSpeaking(false)
        cleanupAudio()
      }

      return !decodeError
    } catch (err) {
      console.warn('[useTTS] /api/tts fetch failed:', err)
      return false
    }
  }

  async function speak(text: string, voiceId: string) {
    if (!text || text.trim().length === 0) return

    // Cancel anything currently speaking
    cleanupAudio()
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel() } catch { /* ignore */ }
    }

    // Optimistically flag speaking so the UI reacts instantly while
    // the network request is in flight. The audio events + fallback
    // path will correct it either way.
    setIsSpeaking(true)

    const ok = await speakWithElevenLabs(text, voiceId)
    if (!ok) {
      // Fall back to the browser so the user always hears something
      speakWithWebSpeech(text)
    }
  }

  return { speak, isSpeaking }
}
