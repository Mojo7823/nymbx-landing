import { X } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { algorithmLabels } from './hashLogic'
import { isProblem, statusLabels, type VerifyRow, type VerifySummary } from './verify'

const chipClasses: Record<VerifyRow['status'], string> = {
  pass: 'border-pine/30 bg-mint/40 text-pine',
  fail: 'border-rose bg-rose-soft text-rose',
  missing: 'border-amber-badge/40 bg-amber-soft text-amber-badge',
  extra: 'border-line-strong bg-soft text-muted',
  pending: 'border-line-strong bg-soft text-muted',
  unsupported: 'border-line-strong bg-soft text-muted',
  error: 'border-rose bg-rose-soft text-rose',
}

const matchedByLabels: Record<NonNullable<VerifyRow['matchedBy']>, string> = {
  path: 'matched by path',
  name: 'matched by file name',
  case: 'matched ignoring case',
  separators: 'matched ignoring path separators',
}

export interface VerifyTableProps {
  rows: VerifyRow[]
  summary: VerifySummary
  manifestName: string
  filter: 'all' | 'problems'
  onFilterChange: (filter: 'all' | 'problems') => void
  /** 0–100 while a matched file is being hashed, else null. */
  progress: (fileId: number) => number | null
  /** Remove a dropped file from the list (rows with a `fileId`). */
  onRemove?: (fileId: number) => void
}

function Chips({ summary }: { summary: VerifySummary }) {
  const chips: [keyof VerifySummary, string, string][] = [
    ['pass', `${summary.pass} passed`, chipClasses.pass],
    ['fail', `${summary.fail} failed`, chipClasses.fail],
    ['missing', `${summary.missing} missing`, chipClasses.missing],
    ['extra', `${summary.extra} extra`, chipClasses.extra],
    ['unsupported', `unsupported ${summary.unsupported}`, chipClasses.unsupported],
    ['error', `${summary.error} unreadable`, chipClasses.error],
    ['pending', `${summary.pending} pending`, chipClasses.pending],
  ]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map(([key, label, classes]) =>
        summary[key] > 0 ? (
          <span
            key={key}
            className={cx('rounded-full border px-2 py-0.5 text-[11px] font-semibold', classes)}
          >
            {label}
          </span>
        ) : null,
      )}
    </div>
  )
}

function verdict(summary: VerifySummary, manifestName: string) {
  if (summary.pending > 0) return null
  if (summary.fail + summary.error > 0) {
    const n = summary.fail + summary.error
    return {
      tone: 'border-rose bg-rose-soft text-rose',
      text: `${n} ${n === 1 ? 'file' : 'files'} FAILED verification`,
    }
  }
  if (summary.missing + summary.extra > 0) {
    const parts = [`${summary.pass} verified`]
    if (summary.missing > 0) parts.push(`${summary.missing} missing from the drop`)
    if (summary.extra > 0) parts.push(`${summary.extra} not in the manifest`)
    return {
      tone: 'border-amber-badge/40 bg-amber-soft text-amber-badge',
      text: parts.join(' · '),
    }
  }
  if (summary.pass > 0) {
    return {
      tone: 'border-pine/30 bg-mint/40 text-pine',
      text: `All ${summary.pass} ${summary.pass === 1 ? 'file' : 'files'} verified against ${manifestName}`,
    }
  }
  return null
}

export function VerifyTable({
  rows,
  summary,
  manifestName,
  filter,
  onFilterChange,
  progress,
  onRemove,
}: VerifyTableProps) {
  const shown = filter === 'problems' ? rows.filter(isProblem) : rows
  const banner = verdict(summary, manifestName)

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Chips summary={summary} />
        <div className="flex items-center gap-1" role="group" aria-label="Row filter">
          {(['all', 'problems'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onFilterChange(value)}
              aria-pressed={filter === value}
              className={cx(
                'cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors',
                filter === value
                  ? 'bg-soft text-ink'
                  : 'text-muted hover:bg-soft/60 hover:text-ink',
              )}
            >
              {value === 'all' ? 'All' : 'Problems only'}
            </button>
          ))}
        </div>
      </div>

      {banner && (
        <p
          role="status"
          className={cx('mb-3 rounded-md border px-3 py-2 text-sm font-semibold', banner.tone)}
        >
          {banner.text}
        </p>
      )}

      <ul className="space-y-2">
        {shown.map((row, i) => {
          const percent = row.fileId === undefined ? null : progress(row.fileId)
          const algo = row.entry?.algorithm
          return (
            <li
              key={`${row.status}-${row.path}-${i}`}
              className="rounded-lg border border-line bg-card px-3 py-2.5 sm:grid sm:grid-cols-[7rem_minmax(0,1fr)_6rem] sm:items-start sm:gap-3"
            >
              <span
                className={cx(
                  'inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                  chipClasses[row.status],
                )}
              >
                {statusLabels[row.status]}
              </span>

              <div className="mt-1.5 min-w-0 sm:mt-0">
                <p className="font-mono text-xs break-all text-ink">{row.path}</p>
                {row.matchedBy && row.filePath && (
                  <p className="font-mono text-[11px] break-all text-muted">
                    {matchedByLabels[row.matchedBy]}: {row.filePath}
                  </p>
                )}
                {row.status === 'unsupported' && row.note && (
                  <p className="text-[11px] text-muted">{row.note}</p>
                )}

                {row.entry && row.status !== 'unsupported' && (
                  <dl className="mt-1 space-y-0.5">
                    {(row.status === 'fail' || row.status === 'missing' || row.status === 'pass') &&
                      (row.status === 'pass' ? (
                        <div className="flex items-start gap-2">
                          <dt className="w-14 shrink-0 font-mono text-[11px] text-muted">
                            {algo ? algorithmLabels[algo] : ''}
                          </dt>
                          <dd className="min-w-0 flex-1 font-mono text-[11px] break-all text-pine">
                            {row.entry.digest} <span aria-hidden="true">✓</span>
                          </dd>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start gap-2">
                            <dt className="w-14 shrink-0 font-mono text-[11px] text-muted">
                              expected
                            </dt>
                            <dd className="min-w-0 flex-1 font-mono text-[11px] break-all text-ink">
                              {row.entry.digest}
                            </dd>
                          </div>
                          {row.actual && (
                            <div className="flex items-start gap-2">
                              <dt className="w-14 shrink-0 font-mono text-[11px] text-muted">
                                actual
                              </dt>
                              <dd className="min-w-0 flex-1 font-mono text-[11px] break-all text-rose">
                                {row.actual}
                              </dd>
                              <CopyButton
                                text={row.actual}
                                label=""
                                aria-label={`Copy the computed hash of ${row.path}`}
                                className="shrink-0"
                              />
                            </div>
                          )}
                        </>
                      ))}
                  </dl>
                )}

                {row.status === 'pending' && percent !== null && (
                  <ProgressBar className="mt-2" value={percent} label="Hashing" />
                )}
              </div>

              <span className="mt-1 flex items-center gap-1 sm:mt-0 sm:justify-end">
                <span className="font-mono text-[11px] text-muted tabular-nums">
                  {row.size === undefined ? '—' : formatBytes(row.size)}
                </span>
                {onRemove && row.fileId !== undefined && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(row.fileId!)}
                    aria-label={`Remove ${row.filePath ?? row.path}`}
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {shown.length === 0 && (
        <p className="rounded-lg border border-line bg-card px-3 py-6 text-center text-sm text-muted">
          {filter === 'problems' ? 'No problems to show.' : 'No checksum lines found.'}
        </p>
      )}
    </section>
  )
}
