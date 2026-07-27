import type { CSSProperties } from 'react'

/** One glyph per tile, drawn inside a 24×24 box centred on the tile. */
const GLYPHS = [
  'M-7 -6 h14 M-7 0 h14 M-7 6 h9',
  'M-6 -6 l-4 6 l4 6 M6 -6 l4 6 l-4 6',
  'M-8 6 l5 -11 l5 7 l3 -4 l3 8 z',
  'M0 -8 v16 M-8 0 h16',
  'M-7 4 l5 -6 l4 4 l5 -8',
  'M-6 -7 h12 v14 h-12 z M-3 -7 v14',
  'M-8 0 a8 8 0 0 1 16 0 a8 8 0 0 1 -16 0 M0 -5 v5 l4 3',
  'M-7 -5 h14 M-4 0 h8 M-1 5 h2',
]

/** Tile grid positions (3 columns × 3 rows) with the lock in the centre. */
const COLS = [104, 160, 216]
const ROWS = [42, 92, 142]

export function ToolboxArt() {
  const tiles: { x: number; y: number; glyph: string; delay: string }[] = []
  let g = 0
  ROWS.forEach((y, row) =>
    COLS.forEach((x, col) => {
      if (row === 1 && col === 1) return // centre cell holds the padlock
      tiles.push({ x, y, glyph: GLYPHS[g % GLYPHS.length], delay: `${g * 45}ms` })
      g += 1
    }),
  )

  return (
    <svg viewBox="0 0 320 180" role="img" aria-label="Grid of tool tiles around a padlock">
      {tiles.map((t) => (
        <g
          key={`${t.x}-${t.y}`}
          className="art-tile"
          style={{ '--delay': t.delay } as CSSProperties}
        >
          <rect
            x={t.x - 21}
            y={t.y - 19}
            width="42"
            height="38"
            rx="9"
            fill="var(--c-art-panel-2)"
            stroke="var(--c-art-dim)"
            strokeWidth="1.5"
          />
          <path
            d={t.glyph}
            transform={`translate(${t.x} ${t.y})`}
            className="art-stroke"
            stroke="var(--c-art-ink)"
            strokeWidth="2"
            opacity="0.8"
          />
        </g>
      ))}

      {/* Privacy padlock: the shackle springs shut on hover. */}
      <g>
        <path
          className="art-stroke art-accent art-lock__shackle"
          strokeWidth="3"
          d="M152 92 v-9 a8 8 0 0 1 16 0 v9"
        />
        <rect
          x="146"
          y="90"
          width="28"
          height="22"
          rx="5"
          fill="var(--c-art-accent)"
          opacity="0.9"
        />
      </g>
    </svg>
  )
}
