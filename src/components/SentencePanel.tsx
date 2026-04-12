interface Props {
  bufferDisplay: string[]
  currentSentence: string
  pendingSentence: string
  sentenceHistory: string[]
  isProcessing: boolean
  onBuild: () => void
  onRelease: () => void
  onClear: () => void
  onSpeak: (text: string) => void
  currentGesture: string | null
  displayText: string
}

export function SentencePanel({
  bufferDisplay,
  currentSentence,
  pendingSentence,
  sentenceHistory,
  isProcessing,
  onBuild,
  onRelease,
  onClear,
  onSpeak,
  currentGesture,
  displayText,
}: Props) {
  const hasLiveGesture = currentGesture !== null && currentGesture !== 'None' && displayText !== ''

  return (
    <div
      className="card"
      style={{
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* ── Live detection ────────────────────────────────────────── */}
      <div
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '52px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              color: 'var(--text-3)',
              fontWeight: 500,
              marginBottom: '4px',
            }}
          >
            Detecting
          </div>
          <div
            style={{
              fontFamily: hasLiveGesture ? 'var(--font-display)' : 'var(--font-ui)',
              fontSize: hasLiveGesture ? '26px' : '22px',
              fontStyle: hasLiveGesture ? 'italic' : 'normal',
              fontWeight: hasLiveGesture ? 400 : 300,
              color: hasLiveGesture ? 'var(--primary)' : 'var(--border-2)',
              minHeight: '30px',
              letterSpacing: hasLiveGesture ? '-0.01em' : '0',
              lineHeight: 1.1,
            }}
          >
            {hasLiveGesture ? displayText : '—'}
          </div>
        </div>

        {/* Pulse dot */}
        <div
          style={{
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            background: hasLiveGesture ? 'var(--primary)' : 'var(--border)',
            animation: hasLiveGesture ? 'pulse 1s ease-in-out infinite' : 'none',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
        />
      </div>

      {/* ── Sign buffer ───────────────────────────────────────────── */}
      <div>
        <div
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--primary)',
            marginBottom: '10px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          Signs collected
          {bufferDisplay.length > 0 && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--primary)',
                animation: 'pulse 1.2s ease-in-out infinite',
                display: 'inline-block',
              }}
            />
          )}
        </div>

        {bufferDisplay.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-3)', fontStyle: 'italic', margin: 0 }}>
            Start signing to build a sentence
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {bufferDisplay.map((token, i) => (
              <span
                key={`${token}-${i}`}
                style={{
                  background: 'var(--primary-dim)',
                  color: 'var(--primary)',
                  borderRadius: 'var(--r-pill)',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 500,
                  animation: 'fadeUp 0.15s ease-out',
                  border: '1px solid rgba(26,77,58,0.15)',
                }}
              >
                {token}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Sentence output ───────────────────────────────────────── */}
      <div>
        <div
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--text-3)',
            fontWeight: 500,
            marginBottom: '10px',
          }}
        >
          Sentence
        </div>

        <div
          style={{
            background: pendingSentence ? 'rgba(200,169,110,0.06)' : 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderLeft: pendingSentence ? '3px solid var(--amber)' : '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            padding: '14px 16px',
            minHeight: '60px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            overflow: 'hidden',
            position: 'relative',
            transition: 'background 0.2s, border-left 0.2s',
          }}
        >
          {isProcessing ? (
            <div
              className="shimmer"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 'var(--r-md)',
                display: 'flex',
                alignItems: 'center',
                paddingLeft: '16px',
              }}
            >
              <span style={{ color: 'var(--text-3)', fontSize: '13px', fontStyle: 'italic' }}>
                Building sentence…
              </span>
            </div>
          ) : pendingSentence ? (
            /* Pending sentence — about to release */
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <span
                  key={pendingSentence}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '20px',
                    fontStyle: 'italic',
                    color: 'var(--text)',
                    animation: 'fadeUp 0.25s ease-out',
                    flex: 1,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.3,
                  }}
                >
                  {pendingSentence}
                </span>
                <button
                  onClick={onRelease}
                  title="Release now"
                  style={{
                    flexShrink: 0,
                    padding: '5px 14px',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--amber)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  Release
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--amber)',
                    animation: 'pulse 0.8s ease-in-out infinite',
                  }}
                />
                <span style={{ fontSize: '10px', color: 'var(--amber)', fontWeight: 500 }}>
                  Releasing…
                </span>
              </div>
            </div>
          ) : currentSentence ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span
                key={currentSentence}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '20px',
                  fontStyle: 'italic',
                  color: 'var(--text)',
                  animation: 'fadeUp 0.25s ease-out',
                  flex: 1,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.3,
                }}
              >
                {currentSentence}
              </span>
              <button
                onClick={() => onSpeak(currentSentence)}
                title="Speak"
                style={{
                  flexShrink: 0,
                  padding: '5px 14px',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--primary)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                Speak
              </button>
            </div>
          ) : (
            <span style={{ color: 'var(--text-3)', fontSize: '13px', fontStyle: 'italic' }}>
              Sentence will appear here
            </span>
          )}
        </div>
      </div>

      {/* ── History ───────────────────────────────────────────────── */}
      {sentenceHistory.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              color: 'var(--text-3)',
              fontWeight: 500,
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            History
            <span
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-3)',
                borderRadius: 'var(--r-pill)',
                padding: '1px 7px',
                fontSize: '10px',
                border: '1px solid var(--border)',
              }}
            >
              {sentenceHistory.length}
            </span>
          </div>

          <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {[...sentenceHistory].reverse().map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '7px 0',
                  borderBottomWidth: i < sentenceHistory.length - 1 ? '1px' : '0',
                  borderBottomStyle: 'solid',
                  borderBottomColor: 'var(--border)',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--text-2)', flex: 1, lineHeight: 1.4 }}>{s}</span>
                <button
                  onClick={() => onSpeak(s)}
                  title="Speak"
                  style={{
                    flexShrink: 0,
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-3)',
                    fontSize: '14px',
                    padding: '2px 4px',
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  🔊
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Controls ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onBuild}
            disabled={isProcessing || bufferDisplay.length === 0}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 'var(--r-md)',
              background: isProcessing || bufferDisplay.length === 0 ? 'var(--surface-2)' : 'var(--primary)',
              color: isProcessing || bufferDisplay.length === 0 ? 'var(--text-3)' : '#ffffff',
              border: `1px solid ${isProcessing || bufferDisplay.length === 0 ? 'var(--border)' : 'var(--primary)'}`,
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              cursor: isProcessing || bufferDisplay.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {isProcessing ? (
              <>
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'var(--text-3)',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                    display: 'inline-block',
                  }}
                />
                Building…
              </>
            ) : (
              'Build sentence'
            )}
          </button>

          <button
            onClick={onClear}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--r-md)',
              background: 'transparent',
              color: 'var(--text-3)',
              border: '1px solid var(--border)',
              fontSize: '13px',
            }}
          >
            Clear
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>
            or pause 3s to auto-build
          </span>
          <span style={{ fontSize: '10px', color: 'var(--border-2)', textAlign: 'center', lineHeight: 1.6 }}>
            Spell letter-by-letter ·{' '}
            <span style={{
              background: 'var(--primary-dim)',
              color: 'var(--primary)',
              borderRadius: 'var(--r-sm)',
              padding: '1px 5px',
              fontFamily: 'monospace',
              fontSize: '10px',
            }}>
              SPACE
            </span>
            {' '}between words ·{' '}
            <span style={{
              background: 'var(--amber-dim)',
              color: 'var(--amber)',
              borderRadius: 'var(--r-sm)',
              padding: '1px 5px',
              fontFamily: 'monospace',
              fontSize: '10px',
            }}>
              Open_Palm
            </span>
            {' '}= PLEASE
          </span>
        </div>
      </div>
    </div>
  )
}
