import { useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import {
  convertBatch,
  convertTimestamp,
  listZones,
  localZone,
  parseTimestampInput,
  type ConvertedTimestamp,
  type EpochUnit,
  type InputKind,
} from './convert'

type Tab = 'single' | 'batch'

const UNITS: [EpochUnit, string][] = [
  ['auto', 'Auto-detect'],
  ['seconds', 'Seconds'],
  ['milliseconds', 'Milliseconds'],
  ['microseconds', 'Microseconds'],
]

const KIND_LABELS: Record<InputKind, string> = {
  'epoch-seconds': 'epoch seconds',
  'epoch-milliseconds': 'epoch milliseconds',
  'epoch-microseconds': 'epoch microseconds',
  'date-string': 'date string',
}

function trimZeros(value: number): string {
  return String(value)
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:gap-4">
      <dt className="w-40 shrink-0 text-xs font-semibold text-muted">{label}</dt>
      <dd className="flex min-w-0 grow items-center gap-2">
        <span className="min-w-0 grow font-mono text-xs break-all text-ink">{value}</span>
        <CopyButton text={value} label="" aria-label={`Copy ${label}`} />
      </dd>
    </div>
  )
}

export default function TimestampConverter() {
  const zones = useMemo(() => listZones(), [])
  const [tab, setTab] = useState<Tab>('single')
  const [zone, setZone] = useState(localZone)
  const [zoneQuery, setZoneQuery] = useState(zone)
  const [unit, setUnit] = useState<EpochUnit>('auto')
  const [input, setInput] = useState('')
  const [batchText, setBatchText] = useState('')

  const single = useMemo((): {
    result?: ConvertedTimestamp
    kind?: InputKind
    error?: string
  } => {
    if (!input.trim()) return {}
    try {
      const parsed = parseTimestampInput(input, unit, zone)
      return { result: convertTimestamp(parsed.millis, zone), kind: parsed.kind }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Conversion failed.' }
    }
  }, [input, unit, zone])

  const batchRows = useMemo(
    () => (tab === 'batch' && batchText.trim() ? convertBatch(batchText, unit, zone) : []),
    [tab, batchText, unit, zone],
  )

  function applyZone(value: string) {
    setZoneQuery(value)
    if (zones.includes(value)) setZone(value)
  }

  return (
    <ToolLayout
      title="Timestamp ↔ date converter"
      description="Convert between Unix epochs (seconds, milliseconds or microseconds — auto-detected), ISO 8601 and human-readable dates in any timezone, with relative time and batch conversion. Everything runs in your browser."
      badge="client-side"
    >
      <div role="tablist" aria-label="Mode" className="mb-4 flex gap-1">
        {(
          [
            ['single', 'Single'],
            ['batch', 'Batch'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cx(
              'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              tab === value ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line bg-soft p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Timezone (type to search)
          <input
            name="zone"
            list="zone-list"
            value={zoneQuery}
            onChange={(event) => applyZone(event.target.value)}
            onBlur={() => setZoneQuery(zone)}
            aria-label="Timezone"
            autoComplete="off"
            className="w-64 rounded-md border border-line bg-card px-2 py-1.5 font-mono text-xs text-ink focus:border-pine focus:outline-none"
          />
          <datalist id="zone-list">
            {zones.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Epoch unit
          <select
            name="unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value as EpochUnit)}
            className="rounded-md border border-line bg-card px-2 py-1.5 text-xs text-ink focus:border-pine focus:outline-none"
          >
            {UNITS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-1.5 text-xs text-faint">
          Using <span className="font-mono text-muted">{zone}</span>
        </span>
      </div>

      {tab === 'single' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              name="timestamp"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="1700000000 · 2024-02-29T12:00:00Z · Tue, 14 Nov 2023 22:13:20 GMT"
              aria-label="Timestamp or date"
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 grow rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus:border-pine focus:outline-none"
            />
            <Button onClick={() => setInput(String(Date.now()))}>
              <Clock className="size-4" />
              Now
            </Button>
          </div>

          {single.error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-line bg-rose-soft p-3 text-sm text-rose"
            >
              {single.error}
            </p>
          )}

          {single.result && (
            <section className="mt-6 border-t border-line pt-5" aria-labelledby="result-heading">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 id="result-heading" className="mr-auto text-sm font-semibold text-ink">
                  Converted
                </h2>
                <span className="text-xs text-muted">
                  detected as <span className="font-semibold">{KIND_LABELS[single.kind!]}</span> ·{' '}
                  {single.result.relative}
                </span>
              </div>
              <dl className="divide-y divide-line rounded-lg border border-line bg-card px-4 py-1">
                <ResultRow label="Epoch seconds" value={trimZeros(single.result.epochSeconds)} />
                <ResultRow
                  label="Epoch milliseconds"
                  value={trimZeros(single.result.epochMillis)}
                />
                <ResultRow
                  label="Epoch microseconds"
                  value={trimZeros(single.result.epochMicros)}
                />
                <ResultRow
                  label={`ISO 8601 (${single.result.zoneName})`}
                  value={single.result.iso}
                />
                <ResultRow label="ISO 8601 (UTC)" value={single.result.isoUtc} />
                <ResultRow label="Human readable" value={single.result.human} />
              </dl>
            </section>
          )}
        </>
      ) : (
        <>
          <textarea
            name="batch"
            value={batchText}
            onChange={(event) => setBatchText(event.target.value)}
            placeholder={'One timestamp per line:\n1700000000\n2024-02-29T12:00:00Z\n1710054000000'}
            aria-label="Batch input"
            spellCheck={false}
            className="h-40 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
          />
          {batchRows.length > 0 && (
            <section className="mt-4" aria-labelledby="batch-heading">
              <div className="mb-2 flex items-center justify-between">
                <h2 id="batch-heading" className="text-sm font-semibold text-ink">
                  Results <span className="font-normal text-muted">({batchRows.length})</span>
                </h2>
                <CopyButton
                  label="Copy as TSV"
                  text={() =>
                    batchRows
                      .map((row) =>
                        row.result
                          ? `${row.input}\t${row.result.iso}\t${row.result.epochMillis}`
                          : `${row.input}\t${row.error}\t`,
                      )
                      .join('\n')
                  }
                />
              </div>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-soft text-muted">
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Input
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        ISO 8601 ({zone})
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Epoch ms
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Relative
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-card">
                    {batchRows.map((row, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 font-mono whitespace-nowrap text-muted">
                          {row.input}
                        </td>
                        {row.result ? (
                          <>
                            <td className="px-3 py-2 font-mono whitespace-nowrap text-ink">
                              {row.result.iso}
                            </td>
                            <td className="px-3 py-2 font-mono text-ink tabular-nums">
                              {row.result.epochMillis}
                            </td>
                            <td className="px-3 py-2 text-muted">{row.result.relative}</td>
                          </>
                        ) : (
                          <td colSpan={3} className="px-3 py-2 text-rose">
                            {row.error}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </ToolLayout>
  )
}
