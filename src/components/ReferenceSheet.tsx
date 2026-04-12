import { useState } from 'react'
import { ASL_REFERENCE, TOTAL_SIGNS } from '../data/aslReference'
import { HandDiagram } from './HandDiagram'

interface Props {
  onClose: () => void
  currentGesture: string | null
}

export function ReferenceSheet({ onClose, currentGesture }: Props) {
  const [search, setSearch] = useState('')
  const [activeSection, setActiveSection] = useState(-1)

  const filtered = ASL_REFERENCE
    .map((section, sectionIdx) => ({
      ...section,
      sectionIdx,
      signs: section.signs.filter((sign) =>
        search === '' ||
        sign.label.toLowerCase().includes(search.toLowerCase()) ||
        sign.tip.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter(
      (section) =>
        (activeSection === -1 || section.sectionIdx === activeSection) &&
        section.signs.length > 0
    )

  const tabs = ['All', ...ASL_REFERENCE.map((s) => s.title)]

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(247,245,242,0.97)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: '16px 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          background: 'var(--surface)',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '22px',
              fontStyle: 'italic',
              color: 'var(--primary)',
              letterSpacing: '-0.01em',
            }}
          >
            ASL Reference
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
            Hold each sign steady for 2 seconds · EchoSense will detect it
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="text"
            placeholder="Search signs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding: '7px 13px',
              color: 'var(--text)',
              fontSize: '13px',
              width: '200px',
              outline: 'none',
            }}
          />
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--r-pill)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-3)',
              fontSize: '18px',
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Section tabs */}
      <div
        style={{
          flexShrink: 0,
          padding: '0 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: '2px',
          overflowX: 'auto',
          background: 'var(--surface)',
        }}
      >
        {tabs.map((tab, tabIdx) => {
          const isActive = tabIdx === 0 ? activeSection === -1 : activeSection === tabIdx - 1
          return (
            <button
              key={tab}
              onClick={() => setActiveSection(tabIdx === 0 ? -1 : tabIdx - 1)}
              style={{
                padding: '10px 16px',
                fontSize: '12px',
                fontWeight: isActive ? 500 : 400,
                cursor: 'pointer',
                borderBottomWidth: '2px',
                borderBottomStyle: 'solid',
                borderBottomColor: isActive ? 'var(--primary)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-3)',
                background: 'transparent',
                border: 'none',
                borderBottom: undefined,
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}
            >
              {tab}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-3)', fontSize: '14px', textAlign: 'center', marginTop: '48px', fontStyle: 'italic' }}>
            No signs found matching "{search}"
          </div>
        )}

        {filtered.map((section) => (
          <div key={section.title} style={{ marginBottom: '40px' }}>
            {/* Section header */}
            <div
              style={{
                borderLeft: `3px solid ${section.color}`,
                paddingLeft: '14px',
                marginBottom: '18px',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '18px',
                  fontStyle: 'italic',
                  color: 'var(--text)',
                  letterSpacing: '-0.01em',
                }}
              >
                {section.title}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-3)', marginTop: '2px' }}>
                {section.description}
              </div>
            </div>

            {/* Signs grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '12px',
              }}
            >
              {section.signs.map((sign) => {
                const isDetected = sign.gestureKey === currentGesture
                return (
                  <div
                    key={sign.gestureKey}
                    style={{
                      background: isDetected ? 'rgba(26,77,58,0.04)' : 'var(--surface)',
                      border: `1px solid ${isDetected ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 'var(--r-lg)',
                      padding: '16px',
                      transition: 'border-color 0.2s',
                      position: 'relative',
                      boxShadow: isDetected ? '0 0 0 3px rgba(26,77,58,0.08)' : 'none',
                    }}
                  >
                    {isDetected && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          background: 'var(--primary)',
                          color: '#ffffff',
                          fontSize: '9px',
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: 'var(--r-pill)',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          animation: 'fadeUp 0.2s ease-out',
                        }}
                      >
                        Detected
                      </div>
                    )}

                    {/* Label row */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '12px',
                      }}
                    >
                      <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text)' }}>
                        {sign.label}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-3)', fontFamily: 'monospace' }}>
                        {sign.gestureKey}
                      </div>
                    </div>

                    {/* Hand diagram */}
                    <div
                      style={{
                        width: '100%',
                        background: 'var(--surface-2)',
                        borderRadius: 'var(--r-md)',
                        padding: '8px 0',
                        marginBottom: '10px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: '90px',
                      }}
                    >
                      <HandDiagram gestureKey={sign.gestureKey} size="md" />
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '6px', lineHeight: 1.5 }}>
                      {sign.fingers}
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '8px' }}>
                      {sign.handShape}
                    </div>

                    {/* Tip */}
                    <div style={{ display: 'flex', gap: '7px', alignItems: 'flex-start' }}>
                      <div
                        style={{
                          width: '7px',
                          height: '7px',
                          borderRadius: '50%',
                          background: 'var(--amber)',
                          flexShrink: 0,
                          marginTop: '4px',
                        }}
                      />
                      <div style={{ fontSize: '11px', color: 'var(--text-3)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        {sign.tip}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 28px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--surface)',
        }}
      >
        <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
          EchoSense supports {TOTAL_SIGNS} signs across {ASL_REFERENCE.length} categories
        </div>
        <div style={{ fontSize: '11px', color: 'var(--border-2)' }}>
          Switch to Spell mode to type letter by letter →
        </div>
      </div>
    </div>
  )
}
