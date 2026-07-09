import { useState } from 'react'
import { TTSToggle } from './TTSToggle'

const QUICK_RESPONSES = [
  { key: 'Thumb_Up',    label: 'Yes' },
  { key: 'Thumb_Down',  label: 'No' },
  { key: 'Open_Palm',   label: 'Stop' },
  { key: 'Closed_Fist', label: 'Wait' },
  { key: 'Victory',     label: 'Hello' },
  { key: 'ILoveYou',   label: 'I love you' },
  { key: 'Pointing_Up', label: 'One moment' },
]

interface Props {
  currentGesture: string | null
  displayText: string
  confidence: number
  // Hand visible but recent predictions disagree — show a soft hint
  isUnsure?: boolean
  transcript: string[]
  isSpeaking: boolean
  copied: boolean
  mode: 'phrase' | 'spell'
  voices: Array<{ id: string; name: string }>
  selectedVoiceId: string
  onVoiceChange: (id: string) => void
  onCopy: () => void
  onClear: () => void
  onShare: () => void
  onOpenReference?: () => void

  // Auth0
  isAuthenticated: boolean

  // Phrase mode (FIX 2C)
  phraseTTSEnabled: boolean
  onPhraseTTSChange: (v: boolean) => void

  // Spell mode (FIX 1C, 1D, 1E)
  isSpellActive: boolean
  currentSpellWord: string
  finalizedSpellWord: string
  spellLocked: boolean
  spellTTSEnabled: boolean
  onSpellTTSChange: (v: boolean) => void
  onSpellStart: () => void
  onSpellEnd: () => void
  onSpellClear: () => void
}

export function OutputPanel({
  currentGesture,
  displayText,
  confidence,
  isUnsure = false,
  transcript,
  isSpeaking,
  copied,
  mode,
  voices,
  selectedVoiceId,
  onVoiceChange,
  onCopy,
  onClear,
  onShare,
  onOpenReference,
  isAuthenticated,
  phraseTTSEnabled,
  onPhraseTTSChange,
  isSpellActive,
  currentSpellWord,
  finalizedSpellWord,
  spellLocked,
  spellTTSEnabled,
  onSpellTTSChange,
  onSpellStart,
  onSpellEnd,
  onSpellClear,
}: Props) {
  const [refOpen, setRefOpen] = useState(false)
  const [shared, setShared] = useState(false)

  // In phrase mode, the displayText may be empty (letter being held).
  // Show a waiting state in that case.
  const showWaitingForPhrase = mode === 'phrase' && !displayText
  const heroText = mode === 'spell' && !isSpellActive
    ? ''
    : displayText

  return (
    <div
      className="card"
      style={{
        padding: '24px',
        minHeight: '340px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Sign hero ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--text-3)',
            marginBottom: '8px',
            fontWeight: 500,
          }}
        >
          Now detecting
        </div>

        {isUnsure && !displayText ? (
          <div
            aria-live="polite"
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '18px',
              fontStyle: 'italic',
              color: 'var(--text-3)',
              minHeight: '92px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            Didn't catch that — try again
          </div>
        ) : showWaitingForPhrase ? (
          <div
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '18px',
              fontStyle: 'italic',
              color: 'var(--text-3)',
              minHeight: '92px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            Waiting for phrase gesture…
          </div>
        ) : (
          <div key={heroText} className="sign-hero animating">
            {heroText || '\u00A0'}
          </div>
        )}

        {/* Confidence bar */}
        <div
          style={{
            width: '100%',
            height: '3px',
            background: 'var(--border)',
            borderRadius: 'var(--r-pill)',
            marginTop: '16px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${confidence * 100}%`,
              height: '100%',
              background: 'var(--amber)',
              borderRadius: 'var(--r-pill)',
              transition: 'width 180ms ease',
            }}
          />
        </div>

        <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '5px' }}>
          {currentGesture ?? ''}
        </div>
      </div>

      {/* ── SPELL MODE UI ────────────────────────────────────────── */}
      {mode === 'spell' && (
        <div style={{ marginBottom: '20px' }}>
          {/* State: inactive, no finalized word → Start button */}
          {!isSpellActive && !finalizedSpellWord && (
            <button
              onClick={onSpellStart}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 'var(--r-md)',
                background: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                fontSize: '14px',
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}
            >
              Start spelling
            </button>
          )}

          {/* State: active → building word box + finalize button */}
          {isSpellActive && (
            <>
              <div
                style={{
                  padding: '20px',
                  background: 'var(--surface-2)',
                  border: '2px solid var(--primary)',
                  borderRadius: 'var(--r-lg)',
                  minHeight: '96px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '12px',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.09em',
                    color: 'var(--primary)',
                    fontWeight: 500,
                  }}
                >
                  Building word
                </span>

                <div
                  style={{
                    display: 'flex',
                    gap: '4px',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingTop: '18px',
                  }}
                >
                  {currentSpellWord.split('').map((letter, i) => (
                    <span
                      key={`${letter}-${i}`}
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '36px',
                        fontStyle: 'italic',
                        color: 'var(--primary)',
                        animation: 'signPop 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                        display: 'inline-block',
                        lineHeight: 1,
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {letter}
                    </span>
                  ))}
                  {currentSpellWord.length === 0 && (
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '36px',
                        fontStyle: 'italic',
                        color: 'var(--border-2)',
                        animation: 'blink 1s step-end infinite',
                      }}
                    >
                      _
                    </span>
                  )}
                </div>

                {spellLocked && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '12px',
                      fontSize: '11px',
                      color: 'var(--amber)',
                      fontWeight: 500,
                    }}
                  >
                    Hold…
                  </div>
                )}
              </div>

              <button
                onClick={onSpellEnd}
                disabled={currentSpellWord.length === 0}
                style={{
                  width: '100%',
                  marginTop: '10px',
                  padding: '10px 16px',
                  borderRadius: 'var(--r-md)',
                  background: 'transparent',
                  color: currentSpellWord.length === 0 ? 'var(--border-2)' : 'var(--primary)',
                  border: `1px solid ${currentSpellWord.length === 0 ? 'var(--border)' : 'var(--primary)'}`,
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: currentSpellWord.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Finalize word
              </button>
            </>
          )}

          {/* State: inactive, has finalized word → show + Start/Clear */}
          {!isSpellActive && finalizedSpellWord && (
            <>
              <div
                style={{
                  padding: '22px',
                  background: 'rgba(26,77,58,0.04)',
                  border: '1px solid var(--primary)',
                  borderRadius: 'var(--r-lg)',
                  textAlign: 'center',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.09em',
                    color: 'var(--primary)',
                    fontWeight: 500,
                  }}
                >
                  Word
                </span>
                <span
                  key={finalizedSpellWord}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '44px',
                    fontStyle: 'italic',
                    color: 'var(--text)',
                    letterSpacing: '-0.02em',
                    animation: 'signPop 0.4s cubic-bezier(0.34,1.56,0.64,1)',
                    display: 'inline-block',
                    lineHeight: 1,
                  }}
                >
                  {finalizedSpellWord}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <button
                  onClick={onSpellStart}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: 'var(--r-md)',
                    background: 'var(--primary)',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  Spell another word
                </button>
                <button
                  onClick={onSpellClear}
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
            </>
          )}
        </div>
      )}

      {/* ── Transcript ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '12px' }}>
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
              color: 'var(--text-3)',
              fontWeight: 500,
            }}
          >
            Transcript
          </div>

          {isAuthenticated ? (
            <span
              style={{
                fontSize: '10px',
                color: 'var(--primary)',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <polyline
                  points="2,5 4,8 8,2"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Saved
            </span>
          ) : (
            <span style={{ fontSize: '10px', color: 'var(--text-3)', fontStyle: 'italic' }}>
              Sign in to save
            </span>
          )}
        </div>

        {transcript.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-3)', fontStyle: 'italic', lineHeight: 1.6 }}>
            {mode === 'phrase'
              ? 'Try signing: thumbs up = Yes · peace sign = Hello'
              : 'Start spelling to build words letter by letter'}
          </div>
        ) : (
          <div>
            {transcript.map((item, i) => (
              <span key={i} className="msg-bubble">
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick responses (expandable) ─────────────────────────── */}
      {refOpen && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: '12px',
            marginBottom: '12px',
          }}
        >
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-3)', marginBottom: '8px', fontWeight: 500 }}>
            Quick references
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {QUICK_RESPONSES.map((entry) => {
              const active = entry.key === currentGesture
              return (
                <span
                  key={entry.key}
                  style={{
                    borderRadius: 'var(--r-pill)',
                    padding: '5px 11px',
                    fontSize: '12px',
                    background: active ? 'var(--primary)' : 'var(--surface-2)',
                    color: active ? '#ffffff' : 'var(--text-2)',
                    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    transition: 'background 120ms ease',
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  {entry.label}
                </span>
              )
            })}
          </div>
          {onOpenReference && (
            <button
              onClick={onOpenReference}
              style={{
                marginTop: '10px',
                background: 'none',
                border: 'none',
                fontSize: '11px',
                color: 'var(--primary)',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              View all signs →
            </button>
          )}
        </div>
      )}

      {/* ── Bottom strip ─────────────────────────────────────────── */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {/* Row 1: voice + TTS toggle + speaking indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Voice</span>
            <select
              value={selectedVoiceId}
              onChange={(e) => onVoiceChange(e.target.value)}
              style={{
                fontSize: '11px',
                color: 'var(--text-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                padding: '2px 7px',
                background: 'var(--surface-2)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            {isSpeaking && (
              <span style={{ fontSize: '11px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--primary)', display: 'inline-block', animation: 'pulse 1s ease-in-out infinite' }} />
                Speaking
              </span>
            )}
          </div>

          {/* TTS toggle — mode-specific */}
          {mode === 'phrase' && (
            <TTSToggle enabled={phraseTTSEnabled} onChange={onPhraseTTSChange} />
          )}
          {mode === 'spell' && (
            <TTSToggle enabled={spellTTSEnabled} onChange={onSpellTTSChange} />
          )}
        </div>

        {/* Row 2: actions */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {[
            { label: refOpen ? 'Guide ▴' : 'Guide ▾', action: () => setRefOpen((o) => !o) },
            { label: copied ? 'Copied!' : 'Copy', action: onCopy },
            {
              label: 'Save',
              action: () => {
                const content =
                  'EchoSense Transcript\n' +
                  'Generated: ' + new Date().toLocaleString() + '\n---\n' +
                  transcript.join('\n')
                const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
                const a = document.createElement('a')
                a.href = url
                a.download = 'echosense-transcript-' + Date.now() + '.txt'
                a.click()
                URL.revokeObjectURL(url)
              },
            },
            { label: 'Clear', action: onClear },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                fontSize: '11px',
                padding: '4px 10px',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: label === 'Copied!' ? 'var(--primary)' : 'var(--text-2)',
                whiteSpace: 'nowrap',
                fontWeight: label === 'Copied!' ? 500 : 400,
              }}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => {
              onShare()
              setShared(true)
              setTimeout(() => setShared(false), 2000)
            }}
            style={{
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: 'var(--r-sm)',
              border: `1px solid ${shared ? 'var(--primary)' : 'var(--border)'}`,
              background: shared ? 'var(--primary-dim)' : 'var(--surface-2)',
              color: shared ? 'var(--primary)' : 'var(--text-2)',
              whiteSpace: 'nowrap',
              fontWeight: shared ? 500 : 400,
            }}
          >
            {shared ? 'Linked!' : 'Share'}
          </button>
        </div>
      </div>
    </div>
  )
}
