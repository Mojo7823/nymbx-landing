import { useRef, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '../../lib/cx'
import type { MetricDefinition } from './vector'

export interface MetricGroupProps {
  title: string
  hint: string
  metrics: MetricDefinition[]
  selection: Record<string, string>
  onChange: (key: string, value: string) => void
  open: boolean
  onToggle: () => void
  /** Set when at least one metric in the group has a value. */
  active?: boolean
}

function MetricRow({
  metric,
  value,
  onChange,
}: {
  metric: MetricDefinition
  value: string
  onChange: (value: string) => void
}) {
  const container = useRef<HTMLDivElement>(null)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (delta === 0) return
    event.preventDefault()
    const index = metric.values.findIndex((v) => v.value === value)
    const next = metric.values[(index + delta + metric.values.length) % metric.values.length]
    onChange(next.value)
    const buttons = container.current?.querySelectorAll<HTMLButtonElement>('button')
    buttons?.[metric.values.indexOf(next)]?.focus()
  }

  return (
    <div className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-start sm:gap-4">
      <div className="w-56 shrink-0 pt-1">
        <span className="text-xs font-semibold text-ink">{metric.name}</span>
        <span className="ml-1.5 font-mono text-[11px] text-faint">{metric.key}</span>
      </div>
      <div
        ref={container}
        role="radiogroup"
        aria-label={metric.name}
        onKeyDown={handleKeyDown}
        className="flex min-w-0 flex-wrap gap-1.5"
      >
        {metric.values.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              title={option.description}
              onClick={() => onChange(option.value)}
              className={cx(
                'cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors',
                selected
                  ? 'border-pine bg-mint font-semibold text-pine-deep'
                  : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              <span className="font-mono">{option.value}</span>
              <span className="ml-1.5">{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** One collapsible group of metric rows, each row a radiogroup. */
export function MetricGroup({
  title,
  hint,
  metrics,
  selection,
  onChange,
  open,
  onToggle,
  active = false,
}: MetricGroupProps) {
  const panelId = `cvss-group-${title.replace(/\s+/g, '-').toLowerCase()}`

  return (
    <section className="rounded-lg border border-line bg-card">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left"
        >
          <ChevronDown
            className={cx('size-4 shrink-0 text-faint transition-transform', !open && '-rotate-90')}
          />
          <span className="text-sm font-semibold text-ink">{title}</span>
          {active && (
            <span className="rounded-full bg-mint px-2 py-0.5 text-[10px] font-semibold text-pine">
              set
            </span>
          )}
          <span className="ml-auto hidden text-xs text-faint sm:inline">{hint}</span>
        </button>
      </h3>
      {open && (
        <div id={panelId} className="divide-y divide-line border-t border-line px-4 py-1">
          {metrics.map((metric) => (
            <MetricRow
              key={metric.key}
              metric={metric}
              value={selection[metric.key]}
              onChange={(value) => onChange(metric.key, value)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
