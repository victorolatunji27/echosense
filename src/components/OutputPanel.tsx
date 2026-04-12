import { useState } from 'react'

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
  transcript: string[]
  isSpeaking: boolean
  copied: boolean
  mode: 'phrase' | 'spell'
  currentWord: string
  voices: Array<{ id: string; name: string }>
  selectedVoiceId: string
  onVoiceChange: (id: string) => void
  onCopy: () => void
  onClear: () => void
  onShare: () => void
  onOpenReference?: () => void
}

export function OutputPanel({
  currentGesture,
  displayText,
  confidence,
  transcript,
  isSpeaking,
  copied,
  mode,
  currentWord,
  voices,
  selectedVoiceId,
  onVoiceChange,
  onCopy,
  onClear,
  onShare,
  onOpenReference,
}: Props) {
  const [refOpen, setRefOpen] = useState(false)
  const [shared, setShared] = useState(false)

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

        <div
          key={displayText}
          className="sign-hero animating"
        >
          {displayText || '\u00A0'}
        </div>

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

        {/* Gesture key / definition */}
        <div style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '5px' }}>
          {currentGesture ?? ''}
        </div>

        {/* Spell-mode word builder */}
        {mode === 'spell' && currentWord !== '' && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 14px',
              background: 'var(--surface-2)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: '10px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>
              Building word
            </div>
            <span
              className="word-cursor"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '22px',
                fontStyle: 'italic',
                color: 'var(--primary)',
              }}
            >
              {currentWord}
            </span>
          </div>
        )}
        {mode === 'spell' && currentWord === '' && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-3)', fontStyle: 'italic' }}>
            Spell mode: sign letters · Open Palm to commit word
          </div>
        )}
      </div>

      {/* ── Transcript ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', marginBottom: '12px' }}>
        <div
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--text-3)',
            marginBottom: '10px',
            fontWeight: 500,
          }}
        >
          Transcript
        </div>

        {transcript.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-3)', fontStyle: 'italic', lineHeight: 1.6 }}>
            Try signing: thumbs up = Yes · peace sign = Hello · or switch to Spell mode to build words letter by letter
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
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        {/* Voice + speaking */}
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

        {/* Actions */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
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
