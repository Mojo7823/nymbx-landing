import type { CSSProperties } from 'react'

const CX = 120
const CY = 90

/** Contacts the sweep wakes as it passes, ordered clockwise from the top. */
const CONTACTS = [
  { x: 138, y: 52, delay: '0.1s' },
  { x: 158, y: 104, delay: '0.7s' },
  { x: 104, y: 132, delay: '1.4s' },
  { x: 76, y: 74, delay: '2.1s' },
]

/** Severity bars that fill in beside the radar. */
const BARS = [
  { x: 218, h: 34, delay: '0.05s' },
  { x: 240, h: 58, delay: '0.15s' },
  { x: 262, h: 24, delay: '0.25s' },
  { x: 284, h: 46, delay: '0.35s' },
]

/**
 * CRA Assessment: a radar sweep that lights up findings on hover while the
 * severity bars next to it fill.
 */
export function AssessmentArt() {
  return (
    <svg
      viewBox="0 0 320 180"
      role="img"
      aria-label="Radar sweep lighting up findings beside severity bars"
    >
      {[24, 44, 64].map((r) => (
        <circle key={r} cx={CX} cy={CY} r={r} className="art-stroke" opacity="0.4" />
      ))}
      <line x1={CX - 64} y1={CY} x2={CX + 64} y2={CY} className="art-stroke" opacity="0.25" />
      <line x1={CX} y1={CY - 64} x2={CX} y2={CY + 64} className="art-stroke" opacity="0.25" />

      <g className="art-radar__sweep">
        {/* Invisible ring pins the rotation centre to the radar centre. */}
        <circle cx={CX} cy={CY} r="64" fill="none" />
        {/* The wedge trails counter-clockwise so the bright line leads the
            sweep, the way a radar afterglow fades behind the beam. */}
        <path
          d={`M${CX} ${CY} L${CX - 55} ${CY - 32} A64 64 0 0 1 ${CX} ${CY - 64} Z`}
          fill="var(--c-art-accent)"
          opacity="0.18"
        />
        <line
          x1={CX}
          y1={CY}
          x2={CX}
          y2={CY - 64}
          className="art-stroke art-accent"
          strokeWidth="2.5"
        />
      </g>

      {CONTACTS.map((c) => (
        <circle
          key={`${c.x}-${c.y}`}
          cx={c.x}
          cy={c.y}
          r="3.5"
          className="art-radar__dot"
          style={{ '--delay': c.delay } as CSSProperties}
        />
      ))}

      <line x1="208" y1="140" x2="300" y2="140" className="art-stroke" opacity="0.3" />
      {BARS.map((b) => (
        <rect
          key={b.x}
          x={b.x}
          y={140 - b.h}
          width="12"
          height={b.h}
          rx="3"
          fill="var(--c-art-accent)"
          opacity="0.55"
          className="art-radar__bar"
          style={{ '--delay': b.delay } as CSSProperties}
        />
      ))}
    </svg>
  )
}
