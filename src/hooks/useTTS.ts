import { useState } from 'react'

export function useTTS(apiKey: string) {
  const [isSpeaking, setIsSpeaking] = useState(false)

  function speak(text: string) {
    if (!apiKey) {
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 0.9
      window.speechSynthesis.speak(u)
      return
    }

    fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    })
      .then((res) => res.arrayBuffer())
      .then((buffer) => {
        const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/mpeg' }))
        const audio = new Audio(url)
        audio.addEventListener('play', () => setIsSpeaking(true))
        audio.addEventListener('ended', () => setIsSpeaking(false))
        audio.play()
      })
      .catch(() => {
        setIsSpeaking(false)
        const u = new SpeechSynthesisUtterance(text)
        u.rate = 0.9
        window.speechSynthesis.speak(u)
      })
  }

  return { speak, isSpeaking }
}
