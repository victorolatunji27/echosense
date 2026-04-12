interface Props {
  onClose: () => void
}

export function AboutModal({ onClose }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,26,24,0.55)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-lg)',
          padding: '40px',
          maxWidth: '460px',
          width: '90%',
          boxShadow: 'var(--shadow-float)',
          border: '1px solid var(--border)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '28px',
            height: '28px',
            borderRadius: 'var(--r-pill)',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-3)',
            fontSize: '16px',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>

        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '32px',
              fontStyle: 'italic',
              color: 'var(--primary)',
              letterSpacing: '-0.01em',
              lineHeight: 1,
            }}
          >
            EchoSense
          </div>
          <div
            style={{
              fontSize: '13px',
              color: 'var(--text-3)',
              marginTop: '6px',
              letterSpacing: '0.02em',
            }}
          >
            Real-time American Sign Language interpreter
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--border)', marginBottom: '20px' }} />

        {/* Body */}
        <div
          style={{
            fontSize: '14px',
            color: 'var(--text-2)',
            lineHeight: 1.75,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <p>Supports 7 quick-response gestures, the full ASL alphabet A–Z, numbers 0–9, and a Sentence Builder that assembles spelled words into natural English sentences.</p>
          <p>Built with React, MediaPipe Hands, and Claude at BitCamp 2026.</p>
          <p>Share your session transcript as a link — anyone with the link can view your signs instantly, no account required.</p>
          <p
            style={{
              color: 'var(--primary)',
              fontStyle: 'italic',
              borderLeft: '3px solid var(--primary)',
              paddingLeft: '12px',
            }}
          >
            500,000+ ASL users in the US deserve spontaneous communication.
          </p>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: '28px',
            padding: '10px 24px',
            borderRadius: 'var(--r-md)',
            background: 'var(--primary)',
            color: '#ffffff',
            border: 'none',
            fontSize: '13px',
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
