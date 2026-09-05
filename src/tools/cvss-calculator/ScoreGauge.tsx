import { severityStroke, type Severity } from './severity'

export interface ScoreGaugeProps {
  score: number
  severity: Severity
}

const RADIUS = 52
const CENTER_X = 64
const CENTER_Y = 60
const STROKE = 10

function arcPoint(fraction: number): [number, number] {
  const angle = Math.PI * (1 - fraction)
  return [CENTER_X + RADIUS * Math.cos(angle), CENTER_Y - RADIUS * Math.sin(angle)]
}

function arcPath(fraction: number): string {
  const [startX, startY] = arcPoint(0)
  const [endX, endY] = arcPoint(fraction)
  const largeArc = fraction > 0.5 ? 1 : 0
  return `M ${startX} ${startY} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${endX} ${endY}`
}

/** Semicircular 0–10 gauge. Decorative: the score itself is announced elsewhere. */
export function ScoreGauge({ score, severity }: ScoreGaugeProps) {
  const fraction = Math.max(0, Math.min(score / 10, 1))

  return (
    <svg
      viewBox="0 0 128 72"
      className="h-auto w-full max-w-[220px]"
      role="img"
      aria-label={`${score.toFixed(1)} out of 10, ${severity}`}
    >
      <path
        d={arcPath(1)}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      {fraction > 0 && (
        <path
          d={arcPath(fraction)}
          fill="none"
          stroke={severityStroke[severity]}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
      )}
      <text
        x={CENTER_X - RADIUS}
        y={CENTER_Y + 12}
        textAnchor="middle"
        className="fill-faint text-[8px]"
      >
        0
      </text>
      <text
        x={CENTER_X + RADIUS}
        y={CENTER_Y + 12}
        textAnchor="middle"
        className="fill-faint text-[8px]"
      >
        10
      </text>
    </svg>
  )
}
