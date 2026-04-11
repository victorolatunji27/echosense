interface Props {
  text: string | null
}

export function GestureFlash({ text }: Props) {
  if (text === null) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 999,
        background: '#0F6E56',
        padding: '16px 32px',
        textAlign: 'center',
        fontSize: '28px',
        fontWeight: 600,
        color: '#ffffff',
        animation: 'slideDown 0.2s ease-out',
      }}
    >
      {text}
    </div>
  )
}
