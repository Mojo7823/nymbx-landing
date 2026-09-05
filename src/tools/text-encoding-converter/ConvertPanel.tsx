import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Download, Trash2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import type { LineEndingCounts, LineEndingOption, RoundTrip } from './convert'
import { outputFilename } from './filename'
import { encodingName } from './encodings'
import type { BomKind } from './detect'
import type { Inspection } from './encoding.worker'

const BOM_NAMES: Record<BomKind, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
}

const LINE_ENDING_OPTIONS: [LineEndingOption, string][] = [
  ['keep', 'Keep'],
  ['lf', 'LF'],
  ['crlf', 'CRLF'],
]

function lineEndingSummary(counts: LineEndingCounts | null): string {
  if (!counts) return '—'
  switch (counts.kind) {
    case 'none':
      return 'No line breaks'
    case 'lf':
      return 'LF'
    case 'crlf':
      return 'CRLF'
    case 'cr':
      return 'CR'
    case 'mixed': {
      const parts = [
        counts.crlf > 0 && `${counts.crlf} CRLF`,
        counts.lf > 0 && `${counts.lf} LF`,
        counts.cr > 0 && `${counts.cr} CR`,
      ].filter(Boolean)
      return `Mixed (${parts.join(', ')})`
    }
  }
}

export interface ConvertPanelProps {
  fileName: string
  fileSize: number
  bom: BomKind | null
  looksBinary: boolean
  selectedLabel: string | null
  inspection: Inspection | null
  /** `null` while the check is still running. */
  roundTrip: RoundTrip | null
  busy: string | null
  addBom: boolean
  onAddBomChange: (value: boolean) => void
  lineEndings: LineEndingOption
  onLineEndingsChange: (value: LineEndingOption) => void
  onDownload: () => void
  onClear: () => void
  /** The ranked candidate list, rendered between the summary and the preview. */
  candidateSlot?: ReactNode
}

export function ConvertPanel({
  fileName,
  fileSize,
  bom,
  looksBinary,
  selectedLabel,
  inspection,
  roundTrip,
  busy,
  addBom,
  onAddBomChange,
  lineEndings,
  onLineEndingsChange,
  onDownload,
  onClear,
  candidateSlot,
}: ConvertPanelProps) {
  const copyable = inspection !== null && !inspection.truncated && inspection.chars <= 2_000_000

  return (
    <div className="space-y-4">
      <section className="grid overflow-hidden rounded-lg border border-line bg-card sm:grid-cols-3">
        <div className="min-w-0 border-b border-line p-4 sm:border-r sm:border-b-0">
          <p className="text-[10px] font-semibold tracking-widest text-muted uppercase">File</p>
          <p className="mt-1 truncate text-sm font-semibold text-ink" title={fileName}>
            {fileName}
          </p>
          <p className="mt-1 font-mono text-xs text-muted tabular-nums">{formatBytes(fileSize)}</p>
        </div>
        <div className="border-b border-line p-4 sm:border-r sm:border-b-0">
          <p className="text-[10px] font-semibold tracking-widest text-muted uppercase">
            Byte order mark
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">{bom ? BOM_NAMES[bom] : 'None'}</p>
        </div>
        <div className="p-4">
          <p className="text-[10px] font-semibold tracking-widest text-muted uppercase">
            Line endings
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {lineEndingSummary(inspection?.lineEndings ?? null)}
          </p>
        </div>
      </section>

      {looksBinary && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-amber-badge/30 bg-amber-soft p-3 text-xs text-amber-badge"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            This doesn&rsquo;t look like text — most bytes are control characters. You can still
            pick an encoding below.
          </p>
        </div>
      )}

      {candidateSlot}

      <section className="rounded-lg border border-line bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
            Preview{selectedLabel ? ` · ${encodingName(selectedLabel)}` : ''}
          </h2>
          {inspection && (
            <p className="font-mono text-[11px] text-muted tabular-nums">
              {inspection.chars.toLocaleString()} characters
              {inspection.replacements > 0 &&
                ` · ${inspection.replacements.toLocaleString()} undecodable sequences (shown as \u{FFFD})`}
            </p>
          )}
        </div>

        {busy ? (
          <ProgressBar className="my-6" label={busy} />
        ) : inspection ? (
          <>
            <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-line bg-page p-3 font-mono text-xs break-words whitespace-pre-wrap text-ink">
              {inspection.preview}
            </pre>
            {inspection.truncated && (
              <p className="mt-1.5 text-[11px] text-muted">
                Showing the first {inspection.preview.length.toLocaleString()} of{' '}
                {inspection.chars.toLocaleString()} characters
              </p>
            )}
            {roundTrip === null ? (
              <p className="mt-2 text-xs text-muted">
                Checking whether the conversion is lossless…
              </p>
            ) : (
              <p
                className={cx(
                  'mt-2 flex items-start gap-1.5 text-xs',
                  roundTrip.status === 'identical' ? 'text-pine' : 'text-muted',
                )}
              >
                {roundTrip.status === 'identical' ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                ) : (
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                )}
                <span>
                  {roundTrip.status === 'identical' &&
                    'Lossless — re-encoding reproduces the original bytes'}
                  {roundTrip.status === 'differs' &&
                    `Not reversible — ${roundTrip.differing} byte${roundTrip.differing === 1 ? '' : 's'} differ (first at offset 0x${(roundTrip.firstOffset ?? 0).toString(16).toUpperCase()})`}
                  {roundTrip.status === 'skipped' &&
                    'Round-trip check skipped for files over 64 MB'}
                  {roundTrip.status === 'unsupported' && 'ISO-2022-JP cannot be re-encoded here'}
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="my-6 text-center text-xs text-muted">
            Choose an encoding above to preview the text.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-card p-3 sm:p-4">
        <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">Output</h2>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <p className="text-xs text-muted">
            Target: <span className="font-semibold text-ink">UTF-8</span>
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={addBom}
              onChange={(event) => onAddBomChange(event.target.checked)}
              className="size-3.5 accent-[var(--c-pine)]"
            />
            Add UTF-8 BOM
          </label>
          <fieldset className="flex items-center gap-3">
            <legend className="sr-only">Line endings</legend>
            <span className="text-xs font-semibold text-muted">Line endings</span>
            {LINE_ENDING_OPTIONS.map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-1.5 text-xs text-ink"
              >
                <input
                  type="radio"
                  name="line-endings"
                  value={value}
                  checked={lineEndings === value}
                  onChange={() => onLineEndingsChange(value)}
                  className="size-3.5 accent-[var(--c-pine)]"
                />
                {label}
              </label>
            ))}
          </fieldset>
        </div>

        <p className="mt-3 font-mono text-[11px] text-muted">{outputFilename(fileName)}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={onDownload} disabled={!selectedLabel || busy !== null}>
            <Download className="size-3.5" aria-hidden /> Download UTF-8
          </Button>
          <CopyButton
            text={() => inspection?.preview ?? ''}
            label="Copy text"
            disabled={!copyable || busy !== null}
          />
          <Button variant="ghost" onClick={onClear}>
            <Trash2 className="size-3.5" aria-hidden /> Clear
          </Button>
        </div>
      </section>
    </div>
  )
}
