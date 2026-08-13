import type { CSSProperties } from 'react'

/** Sparkles that twinkle around the rings, staggered clockwise from top-left. */
const SPARKS = [
  { d: 'M78 52 L82.5 58 L78 64 L73.5 58 Z', delay: '0s' },
  { d: 'M246 58 L250.5 64 L246 70 L241.5 64 Z', delay: '0.5s' },
  { d: 'M234 132 L238.5 138 L234 144 L229.5 138 Z', delay: '1s' },
  { d: 'M92 134 L96.5 140 L92 146 L87.5 140 Z', delay: '1.5s' },
]

const HEART =
  'M160 54 C148 45 140 37 140 28 C140 20.5 145.5 16 151.5 16 C155 16 158.5 18.5 160 22 ' +
  'C161.5 18.5 165 16 168.5 16 C174.5 16 180 20.5 180 28 C180 37 172 45 160 54 Z'

/**
 * Reneo Planner: two wedding bands slide together and interlock while the
 * heart above them inks itself in and sparkles wake around them.
 */
export function WeddingArt() {
  return (
    <svg
      viewBox="0 0 320 180"
      role="img"
      aria-label="Two wedding rings sliding together beneath a heart"
    >
      {/* Faint trace so the heart reads at rest; the accent stroke inks over it. */}
      <path d={HEART} className="art-stroke" strokeDasharray="3 6" opacity="0.35" />
      <path
        d={HEART}
        className="art-stroke art-accent art-draw"
        strokeWidth="2.5"
        style={{ '--len': '140' } as CSSProperties}
      />

      {SPARKS.map((s) => (
        <path
          key={s.d}
          d={s.d}
          className="art-wed__spark"
          style={{ '--delay': s.delay } as CSSProperties}
        />
      ))}

      <g className="art-wed__ring--l">
        <circle cx="124" cy="100" r="30" className="art-wed__band art-wed__band--l" />
      </g>
      <g className="art-wed__ring--r">
        <circle cx="196" cy="100" r="30" className="art-wed__band art-wed__band--r" />
        <path d="M196 57 L204 66 L196 75 L188 66 Z" className="art-wed__gem" />
      </g>

      {/* Redrawn slice of the left band so it weaves over the right one where
          the rings cross; at rest it sits exactly on the band and disappears. */}
      <path
        d="M129.2 70.5 A30 30 0 0 1 148.6 82.8"
        className="art-wed__ring--l art-wed__band art-wed__band--l"
      />
    </svg>
  )
}
