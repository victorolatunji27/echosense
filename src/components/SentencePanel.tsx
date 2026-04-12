interface Props {
  bufferDisplay: string[]
  currentSentence: string
  sentenceHistory: string[]
  isProcessing: boolean
  onBuild: () => void
  onClear: () => void
  onSpeak: (text: string) => void
}

export function SentencePanel({
  bufferDisplay,
  currentSentence,
  sentenceHistory,
  isProcessing,
  onBuild,
  onClear,
  onSpeak,
}: Props) {
  return (
    <div
      style={{
        background: '#161b22',
        border: '1px solid #1e293b',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* ── Section 1: Sign buffer ─────────────────────────────────────── */}
      <div>
        <div
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#1D9E75',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          Signing...
          {bufferDisplay.length > 0 && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#1D9E75',
                animation: 'pulse 1.2s ease-in-out infinite',
                display: 'inline-block',
              }}
            />
          )}
        </div>

        {bufferDisplay.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#4b5563', fontStyle: 'italic', margin: 0 }}>
            Start signing to build a sentence
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {bufferDisplay.map((token, i) => (
              <span
                key={i}
                style={{
                  background: 'rgba(29,158,117,0.15)',
                  color: '#86efac',
                  borderRadius: '20px',
                  padding: '2px 9px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                }}
              >
                {token}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Current sentence output ────────────────────────── */}
      <div>
        <div
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#64748b',
            marginBottom: '8px',
          }}
        >
          Sentence
        </div>

        <div
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px',
            padding: '14px 16px',
            minHeight: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {isProcessing ? (
            <div
              className="shimmer"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: '16px',
              }}
            >
              <span style={{ color: '#64748b', fontSize: '14px', fontStyle: 'italic' }}>
                Translating...
              </span>
            </div>
          ) : currentSentence ? (
            <>
              <span
                key={currentSentence}
                style={{
                  fontSize: '18px',
                  fontWeight: 500,
                  color: '#ffffff',
                  animation: 'fadeUp 0.25s ease-out',
                  flex: 1,
                }}
              >
                {currentSentence}
              </span>
              <button
                onClick={() => onSpeak(currentSentence)}
                title="Speak"
                style={{
                  flexShrink: 0,
                  padding: '5px 12px',
                  borderRadius: '6px',
                  background: '#1D9E75',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Speak
              </button>
            </>
          ) : (
            <span style={{ color: '#4b5563', fontSize: '13px', fontStyle: 'italic' }}>
              Sentence will appear here
            </span>
          )}
        </div>
      </div>

      {/* ── Section 3: Sentence history ───────────────────────────────── */}
      {sentenceHistory.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#64748b',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            History
            <span
              style={{
                background: '#1e293b',
                color: '#94a3b8',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '10px',
              }}
            >
              {sentenceHistory.length}
            </span>
          </div>

          <div
            style={{
              maxHeight: '140px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {[...sentenceHistory].reverse().map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 0',
                  borderBottom: i < sentenceHistory.length - 1 ? '1px solid #1e293b' : 'none',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '13px', color: '#cbd5e1', flex: 1 }}>{s}</span>
                <button
                  onClick={() => onSpeak(s)}
                  title="Speak"
                  style={{
                    flexShrink: 0,
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '14px',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: '4px',
                  }}
                >
                  🔊
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 4: Controls ───────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onBuild}
            disabled={isProcessing || bufferDisplay.length === 0}
            style={{
              flex: 1,
              padding: '9px 16px',
              borderRadius: '8px',
              background:
                isProcessing || bufferDisplay.length === 0
                  ? '#1e293b'
                  : '#1D9E75',
              color:
                isProcessing || bufferDisplay.length === 0 ? '#4b5563' : '#ffffff',
              border: 'none',
              fontSize: '13px',
              fontWeight: 600,
              cursor:
                isProcessing || bufferDisplay.length === 0
                  ? 'not-allowed'
                  : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {isProcessing ? (
              <>
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                    display: 'inline-block',
                  }}
                />
                Building...
              </>
            ) : (
              'Build sentence'
            )}
          </button>

          <button
            onClick={onClear}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              background: 'transparent',
              color: '#64748b',
              border: '1px solid #334155',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>

        <span style={{ fontSize: '10px', color: '#4b5563', textAlign: 'center' }}>
          or pause 3s to auto-build
        </span>
      </div>
    </div>
  )
}
