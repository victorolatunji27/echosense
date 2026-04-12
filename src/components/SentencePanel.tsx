import { formatStopwatch } from '../hooks/useSentenceBuilder'

interface Props {
  bufferDisplay: string[]
  currentSentence: string
  sentenceHistory: string[]
  isProcessing: boolean
  sessionSeconds: number
  isTiming: boolean
  onBuild: () => void
  onClear: () => void
  onSpeak: (text: string) => void
  currentGesture: string | null
  displayText: string
}

function isLetterToken(t: string): boolean {
  return t.length === 1 && t >= 'A' && t <= 'Z'
}

export function SentencePanel({
  bufferDisplay,
  currentSentence,
  sentenceHistory,
  isProcessing,
  sessionSeconds,
  isTiming,
  onBuild,
  onClear,
  onSpeak,
  currentGesture,
  displayText,
}: Props) {
  const hasLiveGesture = currentGesture !== null && currentGesture !== 'None' && displayText !== ''
  const showStopwatch = isTiming || sessionSeconds > 0

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

      {/* ── Signing label + stopwatch ─────────────────────────────── */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              color: isTiming ? 'var(--amber)' : 'var(--primary)',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Signing…
            {bufferDisplay.length > 0 && isTiming && (
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--amber)',
                  animation: 'pulse 1.2s ease-in-out infinite',
                  display: 'inline-block',
                }}
              />
            )}
          </div>

          {/* Stopwatch */}
          {showStopwatch && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                background: isTiming ? 'rgba(200,169,110,0.10)' : 'rgba(26,77,58,0.08)',
                border: `1px solid ${isTiming ? 'rgba(200,169,110,0.25)' : 'rgba(26,77,58,0.15)'}`,
                borderRadius: 'var(--r-pill)',
                transition: 'all 0.3s ease',
              }}
            >
              {isTiming && (
                <div
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: 'var(--amber)',
                    animation: 'pulse 1s ease-in-out infinite',
                    flexShrink: 0,
                  }}
                />
              )}
              {!isTiming && sessionSeconds > 0 && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <polyline
                    points="2,5 4,8 8,2"
                    stroke="var(--primary)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <span
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '11px',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  color: isTiming ? '#8B6A2E' : 'var(--primary)',
                  letterSpacing: '0.03em',
                }}
              >
                {formatStopwatch(sessionSeconds)}
              </span>
            </div>
          )}
        </div>

        {/* Token pills */}
        {bufferDisplay.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-3)', fontStyle: 'italic', margin: 0 }}>
            Start signing to build a sentence
          </p>
        ) : (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              marginTop: '8px',
              minHeight: '40px',
              alignItems: 'center',
            }}
          >
            {bufferDisplay.map((token, i) => {
              const isLetter = isLetterToken(token)
              return (
                <span
                  key={`${token}-${i}`}
                  style={
                    isLetter
                      ? {
                          background: 'rgba(200,169,110,0.10)',
                          border: '1px solid rgba(200,169,110,0.30)',
                          color: '#8B6A2E',
                          fontFamily: 'var(--font-display)',
                          fontSize: '15px',
                          padding: '4px 10px',
                          borderRadius: 'var(--r-md)',
                          minWidth: '32px',
                          textAlign: 'center',
                          animation: 'fadeIn 0.15s ease',
                          display: 'inline-block',
                        }
                      : {
                          background: 'rgba(26,77,58,0.08)',
                          border: '1px solid rgba(26,77,58,0.20)',
                          color: 'var(--primary)',
                          fontFamily: 'var(--font-ui)',
                          fontSize: '12px',
                          fontWeight: 500,
                          padding: '4px 12px',
                          borderRadius: 'var(--r-md)',
                          animation: 'fadeIn 0.15s ease',
                          display: 'inline-block',
                          letterSpacing: '0.02em',
                        }
                  }
                >
                  {token}
                </span>
              )
            })}
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '11px',
                color: 'var(--text-3)',
                fontStyle: 'italic',
                alignSelf: 'flex-end',
              }}
            >
              {bufferDisplay.length} sign{bufferDisplay.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── Sentence output (3 states) ────────────────────────────── */}
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
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            padding: '14px 16px',
            minHeight: '60px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {isProcessing ? (
            // STATE B — Processing
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: '28px', width: '70%' }} />
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--text-3)',
                  marginTop: '6px',
                  display: 'block',
                  fontStyle: 'italic',
                }}
              >
                Building sentence…
              </span>
            </div>
          ) : currentSentence ? (
            // STATE C — Released
            <>
              <p
                key={currentSentence}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '22px',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: 'var(--text)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.4,
                  flex: 1,
                  margin: 0,
                  animation: 'signPop 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                }}
              >
                {currentSentence}
              </p>
              <button
                onClick={() => onSpeak(currentSentence)}
                title="Speak"
                style={{
                  flexShrink: 0,
                  padding: '6px 14px',
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
            </>
          ) : (
            // STATE A — Empty / waiting
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                opacity: 0.7,
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '2px',
                  background: 'var(--border)',
                  borderRadius: 'var(--r-pill)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(90deg, transparent, var(--amber), transparent)',
                    animation: 'shimmer 1.5s infinite',
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--text-3)',
                  fontStyle: 'italic',
                }}
              >
                {bufferDisplay.length > 0 ? 'Building sentence…' : 'Waiting for signs…'}
              </span>
            </div>
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
