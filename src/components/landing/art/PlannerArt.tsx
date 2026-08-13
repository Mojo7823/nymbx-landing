import type { CSSProperties } from 'react'

/** Column (day) and row (time slot) origins of the availability grid. */
const COLS = [94, 130, 166, 202, 238]
const ROWS = [64, 86, 108, 130]
const CELL_W = 24
const CELL_H = 14

/**
 * Availability marks popping in as each person answers. Opacity encodes how
 * many people picked the slot, heatmap-style; the winner is everyone.
 */
const MARKS = [
  { c: 0, r: 0, op: 0.3, delay: '0s' },
  { c: 1, r: 1, op: 0.55, delay: '0.06s' },
  { c: 2, r: 3, op: 0.3, delay: '0.12s' },
  { c: 0, r: 2, op: 0.55, delay: '0.18s' },
  { c: 4, r: 1, op: 0.3, delay: '0.24s' },
  { c: 3, r: 0, op: 0.55, delay: '0.3s' },
  { c: 1, r: 3, op: 0.3, delay: '0.36s' },
  { c: 4, r: 3, op: 0.55, delay: '0.42s' },
  { c: 2, r: 1, op: 0.55, delay: '0.48s' },
]

/** The slot every respondent shares. */
const WINNER = { c: 3, r: 2, delay: '0.6s' }

/** The people asked for their availability, answering top to bottom. */
const PROFS = [
  { cy: 72, delay: '0s' },
  { cy: 100, delay: '0.16s' },
  { cy: 128, delay: '0.32s' },
]

/**
 * NYMBX Planner: several people mark the dates and times they are free in a
 * weekly grid, and the one slot they all share gets checked off.
 */
export function PlannerArt() {
  const winX = COLS[WINNER.c]
  const winY = ROWS[WINNER.r]
  return (
    <svg
      viewBox="0 0 320 180"
      role="img"
      aria-label="People filling their availability into a date grid until a shared slot is checked"
    >
      {/* People who were asked for their free dates and times. */}
      {PROFS.map((p) => (
        <g key={p.cy} className="art-plan__prof" style={{ '--delay': p.delay } as CSSProperties}>
          <circle cx="40" cy={p.cy} r="10" className="art-stroke" />
          <circle cx="40" cy={p.cy - 3.5} r="3.2" fill="var(--c-art-dim)" stroke="none" />
          <path
            d={`M33.4 ${p.cy + 6.8} A6.6 6.6 0 0 1 46.6 ${p.cy + 6.8} Z`}
            fill="var(--c-art-dim)"
            stroke="none"
          />
        </g>
      ))}

      {/* Calendar window. */}
      <rect
        x="76"
        y="24"
        width="204"
        height="128"
        rx="10"
        fill="var(--c-art-panel-2)"
        stroke="var(--c-art-dim)"
        strokeWidth="2"
      />
      <line x1="76" y1="48" x2="280" y2="48" className="art-stroke" opacity="0.4" />
      {[90, 102, 114].map((x) => (
        <circle key={x} cx={x} cy="36" r="3" className="art-fill-dim" stroke="none" />
      ))}

      {/* Day ticks above the grid. */}
      {COLS.map((x) => (
        <line
          key={x}
          x1={x + 6}
          y1="56"
          x2={x + CELL_W - 6}
          y2="56"
          className="art-stroke"
          opacity="0.5"
        />
      ))}

      {/* Empty date-by-time grid, so the card reads as a planner at rest. */}
      {ROWS.map((y) =>
        COLS.map((x) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={CELL_W}
            height={CELL_H}
            rx="4"
            fill="var(--c-art-dim)"
            opacity="0.15"
            stroke="none"
          />
        )),
      )}

      {/* Availability answers landing in the grid. */}
      {MARKS.map((m) => (
        <rect
          key={`${m.c}-${m.r}`}
          x={COLS[m.c]}
          y={ROWS[m.r]}
          width={CELL_W}
          height={CELL_H}
          rx="4"
          fill="var(--c-art-accent)"
          stroke="none"
          className="art-plan__cell"
          style={{ '--op': m.op, '--delay': m.delay } as CSSProperties}
        />
      ))}

      {/* The slot everyone shares: fills solid, gets checked, then pulses. */}
      <rect
        x={winX}
        y={winY}
        width={CELL_W}
        height={CELL_H}
        rx="4"
        fill="var(--c-art-accent)"
        stroke="none"
        className="art-plan__cell"
        style={{ '--op': 1, '--delay': WINNER.delay } as CSSProperties}
      />
      <rect
        x={winX - 3}
        y={winY - 3}
        width={CELL_W + 6}
        height={CELL_H + 6}
        rx="6"
        fill="none"
        stroke="var(--c-art-accent)"
        strokeWidth="2"
        className="art-plan__halo"
      />
      <path
        d={`M${winX + 6} ${winY + 7.5} L${winX + 10.5} ${winY + 11.5} L${winX + 18} ${winY + 3}`}
        className="art-plan__check"
      />
    </svg>
  )
}
