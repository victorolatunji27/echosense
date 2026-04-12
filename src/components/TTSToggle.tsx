interface Props {
  enabled: boolean
  onChange: (val: boolean) => void
  label?: string
}

export function TTSToggle({ enabled, onChange, label = 'Auto-speak' }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <span
        style={{
          fontSize: '11px',
          color: 'var(--text-2)',
          fontWeight: 500,
          userSelect: 'none',
        }}
      >
        {label}
      </span>
      <button
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        onClick={() => onChange(!enabled)}
        style={{
          width: '36px',
          height: '20px',
          borderRadius: 'var(--r-pill)',
          background: enabled ? 'var(--primary)' : 'var(--border-2)',
          position: 'relative',
          transition: 'background 0.2s',
          border: 'none',
          flexShrink: 0,
          padding: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '2px',
            left: enabled ? '18px' : '2px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            background: '#ffffff',
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
      </button>
    </div>
  )
}
