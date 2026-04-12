import { useEffect, useRef } from 'react'

export function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let mouseX = window.innerWidth / 2
    let mouseY = window.innerHeight / 2
    let ringX  = mouseX
    let ringY  = mouseY
    let raf: number

    function onMove(e: MouseEvent) {
      mouseX = e.clientX
      mouseY = e.clientY
      if (dotRef.current) {
        dotRef.current.style.left = mouseX + 'px'
        dotRef.current.style.top  = mouseY + 'px'
      }
    }

    function onOver(e: MouseEvent) {
      const t = e.target as HTMLElement
      const isInteractive = !!t.closest('button, a, input, select, label, [role="button"], [tabindex]')
      if (dotRef.current)  dotRef.current.style.background  = isInteractive ? 'var(--amber)'  : 'var(--primary)'
      if (ringRef.current) ringRef.current.style.borderColor = isInteractive ? 'var(--amber)' : 'var(--primary)'
      const size = isInteractive ? '38px' : '28px'
      if (ringRef.current) {
        ringRef.current.style.width  = size
        ringRef.current.style.height = size
      }
    }

    function animate() {
      // Lerp ring toward cursor at 14% per frame (~60fps ≈ lag of ~100ms)
      ringX += (mouseX - ringX) * 0.14
      ringY += (mouseY - ringY) * 0.14
      if (ringRef.current) {
        ringRef.current.style.left = ringX + 'px'
        ringRef.current.style.top  = ringY + 'px'
      }
      raf = requestAnimationFrame(animate)
    }

    animate()
    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseover', onOver)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', onOver)
    }
  }, [])

  return (
    <>
      <div
        ref={dotRef}
        className="cursor-dot"
        style={{ transition: 'background 0.15s, width 0.2s, height 0.2s' }}
      />
      <div
        ref={ringRef}
        className="cursor-ring"
        style={{ transition: 'border-color 0.2s, width 0.22s, height 0.22s' }}
      />
    </>
  )
}
