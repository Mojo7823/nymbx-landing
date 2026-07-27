import type { CSSProperties } from 'react'

/**
 * AuCRA: three documentation sheets that fan apart on hover while a
 * compliance shield stamps itself in front of them.
 */
export function DocPlatformArt() {
  return (
    <svg
      viewBox="0 0 320 180"
      role="img"
      aria-label="Documentation sheets fanning out behind a compliance shield"
    >
      <g className="art-doc">
        <Sheet className="art-doc__sheet art-doc__sheet--l" />
        <Sheet className="art-doc__sheet art-doc__sheet--r" />
        <Sheet className="art-doc__sheet art-doc__sheet--c" filled />
      </g>

      <g className="art-doc__shield">
        <path
          d="M160 96 L192 108 V132 c0 20 -14 32 -32 38 c-18 -6 -32 -18 -32 -38 V108 Z"
          fill="var(--c-art-panel)"
          stroke="var(--c-art-accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          className="art-stroke art-accent art-draw"
          style={{ '--len': '30' } as CSSProperties}
          strokeWidth="3"
          d="M147 138 l9 10 l18 -21"
        />
      </g>
    </svg>
  )
}

function Sheet({ className, filled = false }: { className: string; filled?: boolean }) {
  return (
    <g className={className}>
      <rect
        x="128"
        y="24"
        width="64"
        height="86"
        rx="7"
        fill={filled ? 'var(--c-art-panel-2)' : 'var(--c-art-panel)'}
        stroke="var(--c-art-dim)"
        strokeWidth="2"
      />
      {[42, 54, 66, 78, 90].map((y, i) => (
        <rect
          key={y}
          x="140"
          y={y}
          width={i % 3 === 2 ? 24 : 40}
          height="4"
          rx="2"
          className="art-fill-dim"
        />
      ))}
    </g>
  )
}
