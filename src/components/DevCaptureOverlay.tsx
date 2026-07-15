import { useEffect, useRef } from 'react'
import type { Landmark } from '../utils/aslClassifier'
import { FACE_BLENDSHAPE_KEYS } from '../utils/frameFeatures'

// Dev-only visualization of the wide (two-hand + face) capture pipeline —
// confirms both hands are tracked in stable [right, left] slots and that
// face blendshape values respond to expression, before any model consumes
// them (see modelConfig.ts ENABLE_WIDE_CAPTURE / FRAME_FEATURE_COUNT).

const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
]

const RIGHT_COLOR = 'rgba(96,165,250,0.95)'  // blue
const LEFT_COLOR = 'rgba(248,146,96,0.95)'   // orange

interface Props {
  right: Landmark[] | null
  left: Landmark[] | null
  faceFeatures: number[] | null
  nonManualMarker?: string | null
}

export function DevCaptureOverlay({ right, left, faceFeatures, nonManualMarker }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const w = canvas.width
    const h = canvas.height

    function drawHand(lm: Landmark[] | null, color: string) {
      if (!lm) return
      ctx!.strokeStyle = color
      ctx!.lineWidth = 2
      for (const [a, b] of HAND_CONNECTIONS) {
        const p1 = lm[a]
        const p2 = lm[b]
        if (!p1 || !p2) continue
        ctx!.beginPath()
        ctx!.moveTo(p1.x * w, p1.y * h)
        ctx!.lineTo(p2.x * w, p2.y * h)
        ctx!.stroke()
      }
      ctx!.fillStyle = color
      for (const p of lm) {
        ctx!.beginPath()
        ctx!.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2)
        ctx!.fill()
      }
    }

    drawHand(right, RIGHT_COLOR)
    drawHand(left, LEFT_COLOR)
  }, [right, left])

  return (
    <>
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 4,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '12px',
          zIndex: 5,
          background: 'rgba(15,15,15,0.72)',
          borderRadius: '8px',
          padding: '8px 10px',
          fontFamily: 'monospace',
          fontSize: '9px',
          lineHeight: 1.5,
          color: '#fff',
          width: '150px',
          pointerEvents: 'none',
          backdropFilter: 'blur(3px)',
        }}
      >
        <div style={{ marginBottom: '4px', opacity: 0.6, letterSpacing: '0.04em' }}>
          DEV · CAPTURE
        </div>
        <div style={{ marginBottom: '5px' }}>
          <span style={{ color: RIGHT_COLOR }}>●</span> right hand: {right ? 'tracked' : '—'}
          <br />
          <span style={{ color: LEFT_COLOR }}>●</span> left hand: {left ? 'tracked' : '—'}
          {nonManualMarker != null && (
            <>
              <br />
              <span style={{ opacity: 0.6 }}>marker:</span>{' '}
              <span style={{ color: nonManualMarker === 'statement' ? '#aaa' : '#C8A96E' }}>
                {nonManualMarker}
              </span>
            </>
          )}
        </div>
        {faceFeatures ? (
          FACE_BLENDSHAPE_KEYS.map((key, i) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1px' }}>
              <span
                style={{
                  width: '68px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  opacity: 0.85,
                }}
              >
                {key}
              </span>
              <div
                style={{
                  flex: 1,
                  height: '5px',
                  background: 'rgba(255,255,255,0.15)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.round(Math.min(1, Math.max(0, faceFeatures[i] ?? 0)) * 100)}%`,
                    height: '100%',
                    background: '#C8A96E',
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <div style={{ opacity: 0.5 }}>face: not tracked</div>
        )}
      </div>
    </>
  )
}
