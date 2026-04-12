import { useEffect, useState, useRef } from 'react'
import { GESTURE_MAP } from '../utils/gestureMap'
import { HandDiagram } from './HandDiagram'

const GESTURES = [
  'Thumb_Up',
  'Thumb_Down',
  'Open_Palm',
  'Closed_Fist',
  'Victory',
  'ILoveYou',
  'Pointing_Up',
]

const LABELS: Record<string, string> = GESTURE_MAP

function randomIndex(exclude: number): number {
  let idx: number
  do {
    idx = Math.floor(Math.random() * GESTURES.length)
  } while (idx === exclude && GESTURES.length > 1)
  return idx
}

interface Props {
  currentGesture: string | null
  gestureScore: number
  onExit: () => void
}

export function PracticeMode({ currentGesture, gestureScore, onExit }: Props) {
  const [targetIndex, setTargetIndex] = useState(() => Math.floor(Math.random() * GESTURES.length))
  const [score, setScore] = useState(0)
  const [total, setTotal] = useState(0)
  const [correct, setCorrect] = useState(false)
  const [incorrect, setIncorrect] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [showNewQuestion, setShowNewQuestion] = useState(true)
  const streakRef = useRef(0)
  const [streak, setStreak] = useState(0)

  const currentTarget = GESTURES[targetIndex]

  function advanceTo(nextIndex: number) {
    setTargetIndex(nextIndex)
    setCorrect(false)
    setIncorrect(false)
    setIsTransitioning(false)
    setShowNewQuestion(false)
    setTimeout(() => setShowNewQuestion(true), 80)
  }

  // Detect correct/incorrect answers
  useEffect(() => {
    if (isTransitioning) return
    if (!currentGesture || currentGesture === 'None') return

    // Correct answer
    if (currentGesture === currentTarget && gestureScore > 0.8 && !correct) {
      setCorrect(true)
      setScore((s) => s + 1)
      setTotal((t) => t + 1)
      setIsTransitioning(true)
      streakRef.current += 1
      setStreak(streakRef.current)

      setTimeout(() => {
        advanceTo(randomIndex(targetIndex))
      }, 1200)
    }

    // Wrong answer — held with high confidence but wrong gesture
    if (
      currentGesture !== currentTarget &&
      gestureScore > 0.8 &&
      !correct &&
      !incorrect
    ) {
      setIncorrect(true)
      setTotal((t) => t + 1)
      streakRef.current = 0
      setStreak(0)

      setTimeout(() => {
        setIncorrect(false)
      }, 800)
    }
  }, [currentGesture, gestureScore])

  function handleSkip() {
    if (isTransitioning) return
    setTotal((t) => t + 1)
    streakRef.current = 0
    setStreak(0)
    advanceTo(randomIndex(targetIndex))
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(247,245,242,0.96)',
        backdropFilter: 'blur(8px)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '20px',
      }}
    >
      {/* Exit */}
      <button
        onClick={onExit}
        style={{
          position: 'absolute',
          top: '20px',
          right: '24px',
          fontSize: '12px',
          padding: '6px 16px',
          borderRadius: 'var(--r-pill)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text-3)',
          letterSpacing: '0.02em',
        }}
      >
        Exit Practice
      </button>

      {/* Section label */}
      <div
        style={{
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--primary)',
          fontWeight: 500,
        }}
      >
        Practice Mode
      </div>

      {/* Score + streak */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '13px', alignItems: 'center' }}>
        <span style={{ color: 'var(--primary)', fontWeight: 500 }}>✓ {score} correct</span>
        <span style={{ color: 'var(--text-3)' }}>· {total} attempts</span>
        {streak >= 3 && (
          <span style={{ fontSize: '12px', color: 'var(--amber)', fontWeight: 600 }}>
            🔥 {streak} streak
          </span>
        )}
      </div>

      {/* Target card */}
      <div
        style={{
          position: 'relative',
          background: 'var(--surface)',
          borderRadius: 'var(--r-lg)',
          padding: '36px 52px',
          textAlign: 'center',
          minWidth: '280px',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-3)',
            marginBottom: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Sign this
        </div>

        <div
          key={targetIndex}
          style={{
            animation: showNewQuestion
              ? 'signPop 0.3s cubic-bezier(0.34,1.56,0.64,1)'
              : 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '12px',
              animation: 'handIn 0.2s ease-out',
            }}
          >
            <HandDiagram gestureKey={currentTarget} size="lg" />
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '40px',
              fontStyle: 'italic',
              color: 'var(--primary)',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            {LABELS[currentTarget]}
          </div>
        </div>

        <div
          style={{
            fontSize: '11px',
            color: 'var(--text-3)',
            marginTop: '8px',
            fontFamily: 'monospace',
          }}
        >
          {currentTarget}
        </div>

        {/* Correct overlay */}
        {correct && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--r-lg)',
              background: 'rgba(240,253,244,0.94)',
              fontSize: '72px',
              animation: 'scaleIn 0.2s ease-out',
              color: '#16a34a',
            }}
          >
            ✓
          </div>
        )}

        {/* Incorrect overlay */}
        {incorrect && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--r-lg)',
              background: 'rgba(254,242,242,0.94)',
              fontSize: '72px',
              animation: 'scaleIn 0.2s ease-out',
              color: 'var(--red)',
            }}
          >
            ✗
          </div>
        )}
      </div>

      {/* Skip button */}
      <button
        onClick={handleSkip}
        disabled={isTransitioning}
        style={{
          fontSize: '12px',
          padding: '6px 16px',
          borderRadius: 'var(--r-pill)',
          border: '1px solid var(--border)',
          background: 'transparent',
          color: isTransitioning ? 'var(--border)' : 'var(--text-3)',
          cursor: isTransitioning ? 'not-allowed' : 'pointer',
        }}
      >
        Skip →
      </button>

      {/* Detecting hint */}
      {currentGesture && currentGesture !== 'None' && !correct && !incorrect && (
        <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
          Detecting:{' '}
          <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>
            {LABELS[currentGesture] || currentGesture}
          </span>
        </div>
      )}
    </div>
  )
}
