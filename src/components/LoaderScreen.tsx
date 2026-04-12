import { useEffect, useState } from 'react'

interface Props {
  isLoaded: boolean
}

export function LoaderScreen({ isLoaded }: Props) {
  const [progress, setProgress] = useState(0)
  const [fading, setFading] = useState(false)
  const [visible, setVisible] = useState(true)

  // Animate progress to ~88 while loading
  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 88) { clearInterval(id); return 88 }
        return Math.min(p + Math.random() * 7 + 2, 88)
      })
    }, 100)
    return () => clearInterval(id)
  }, [])

  // Complete and fade out when loaded
  useEffect(() => {
    if (!isLoaded) return
    setProgress(100)
    const t1 = setTimeout(() => setFading(true), 250)
    const t2 = setTimeout(() => setVisible(false), 850)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [isLoaded])

  if (!visible) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '36px',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.55s ease',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      {/* Logo block */}
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: '64px',
            lineHeight: 1,
            marginBottom: '16px',
            animation: 'pulse 2.5s ease-in-out infinite',
          }}
        >
          🤟
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '52px',
            fontStyle: 'italic',
            color: 'var(--primary)',
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          EchoSense
        </div>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--text-3)',
            marginTop: '10px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Real-time ASL interpreter
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ width: '200px', textAlign: 'center' }}>
        <div
          style={{
            width: '100%',
            height: '3px',
            background: 'var(--border)',
            borderRadius: 'var(--r-pill)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(progress, 100)}%`,
              height: '100%',
              background: 'var(--primary)',
              borderRadius: 'var(--r-pill)',
              transition: 'width 0.25s ease',
            }}
          />
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-3)',
            marginTop: '10px',
          }}
        >
          {isLoaded ? 'Ready' : 'Loading gesture model…'}
        </div>
      </div>
    </div>
  )
}
