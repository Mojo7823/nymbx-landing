import { cx } from '../lib/cx'

export interface ProgressBarProps {
  /** 0–100. Omit for an indeterminate bar. */
  value?: number
  label?: string
  className?: string
}

export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const determinate = typeof value === 'number'
  const clamped = determinate ? Math.min(100, Math.max(0, value)) : undefined

  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted">
          <span>{label}</span>
          {determinate && <span className="font-mono">{Math.round(clamped!)}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={determinate ? 0 : undefined}
        aria-valuemax={determinate ? 100 : undefined}
        aria-valuenow={clamped}
        className="h-1.5 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className={cx(
            'h-full rounded-full bg-pine transition-[width] duration-300',
            !determinate && 'progress-indeterminate w-1/3',
          )}
          style={determinate ? { width: `${clamped}%` } : undefined}
        />
      </div>
    </div>
  )
}
