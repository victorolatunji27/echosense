import { HandDiagram } from './HandDiagram'

interface Props {
  text: string | null
  gestureKey: string | null
}

export function GestureFlash({ text, gestureKey }: Props) {
  if (text === null) return null

  return (
    <div className="gesture-flash">
      {gestureKey && <HandDiagram gestureKey={gestureKey} size="sm" />}
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '30px',
          fontStyle: 'italic',
          color: '#ffffff',
          letterSpacing: '-0.01em',
        }}
      >
        {text}
      </span>
    </div>
  )
}
