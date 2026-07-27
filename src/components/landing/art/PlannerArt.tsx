import type { CSSProperties } from 'react'

/** Booked slots that slide into the day column on hover. */
const SLOTS = [
  { y: 60, w: 78, delay: '0s' },
  { y: 84, w: 96, delay: '0.12s' },
  { y: 108, w: 62, delay: '0.24s' },
  { y: 132, w: 88, delay: '0.36s' },
]

/**
 * NYMBX Planner: appointments drop into a free day column while the clock
 * hand beside it sweeps forward.
 */
export function PlannerArt() {
  return (
    <svg
      viewBox="0 0 320 180"
      role="img"
      aria-label="Appointments dropping into a day column beside a clock"
    >
      <rect
        x="24"
        y="24"
        width="168"
        height="132"
        rx="10"
        fill="var(--c-art-panel-2)"
        stroke="var(--c-art-dim)"
        strokeWidth="2"
      />
      <line x1="24" y1="48" x2="192" y2="48" className="art-stroke" opacity="0.4" />
      {[38, 52, 66].map((x) => (
        <circle key={x} cx={x} cy="36" r="3" className="art-fill-dim" stroke="none" />
      ))}

      {/* Empty rails, so the card still reads as a planner at rest. */}
      {SLOTS.map((s) => (
        <rect
          key={`rail-${s.y}`}
          x="40"
          y={s.y}
          width="112"
          height="14"
          rx="7"
          fill="none"
          stroke="var(--c-art-dim)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
          opacity="0.5"
        />
      ))}

      {SLOTS.map((s) => (
        <rect
          key={s.y}
          x="40"
          y={s.y}
          width={s.w}
          height="14"
          rx="7"
          fill="var(--c-art-accent)"
          opacity="0.75"
          className="art-plan__slot"
          style={{ '--delay': s.delay } as CSSProperties}
        />
      ))}

      {/* Time cursor riding down the column. */}
      <g className="art-plan__cursor">
        <line x1="32" y1="58" x2="184" y2="58" className="art-stroke art-accent" strokeWidth="2" />
        <circle cx="32" cy="58" r="4" fill="var(--c-art-accent)" />
      </g>

      <circle
        cx="232"
        cy="52"
        r="26"
        fill="var(--c-art-panel)"
        stroke="var(--c-art-dim)"
        strokeWidth="2"
      />
      <g className="art-plan__hand">
        {/* Invisible ring pins the rotation centre to the clock face. */}
        <circle cx="232" cy="52" r="18" fill="none" />
        <line x1="232" y1="52" x2="232" y2="34" className="art-stroke art-accent" strokeWidth="3" />
      </g>
      <circle cx="232" cy="52" r="3" fill="var(--c-art-ink)" />
    </svg>
  )
}
