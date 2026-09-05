import type { Summary } from './types'

export interface OtherPanelProps {
  summary: Summary
  extraXmp: boolean
  onExtraXmp: (value: boolean) => void
  pieceInfo: boolean
  onPieceInfo: (value: boolean) => void
  resetId: boolean
  onResetId: (value: boolean) => void
  busy: boolean
}

interface RowProps {
  checked: boolean
  onChange: (value: boolean) => void
  disabled: boolean
  label: string
  detail?: string
}

function Row({ checked, onChange, disabled, label, detail }: RowProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-start gap-2 text-xs text-ink">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-(--color-pine) disabled:opacity-50"
        />
        <span className={disabled ? 'text-muted' : undefined}>{label}</span>
      </label>
      {detail && <p className="pl-5.5 font-mono text-[11px] break-all text-muted">{detail}</p>}
    </div>
  )
}

export function OtherPanel({
  summary,
  extraXmp,
  onExtraXmp,
  pieceInfo,
  onPieceInfo,
  resetId,
  onResetId,
  busy,
}: OtherPanelProps) {
  return (
    <section className="mb-4 flex flex-col gap-3 rounded-lg border border-line bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Other carriers</h2>
        <p className="mt-1 text-xs text-muted">
          Metadata also hides on individual pages and images, in private application data, and in
          the document identifier.
        </p>
      </div>

      <Row
        checked={extraXmp}
        onChange={onExtraXmp}
        disabled={busy || summary.extraXmp === 0}
        label={
          summary.extraXmp === 0
            ? 'Remove additional XMP streams on pages and images — none found'
            : `Remove ${summary.extraXmp} additional XMP ${
                summary.extraXmp === 1 ? 'stream' : 'streams'
              } on pages and images`
        }
      />
      <Row
        checked={pieceInfo}
        onChange={onPieceInfo}
        disabled={busy || summary.pieceInfo === 0}
        label={
          summary.pieceInfo === 0
            ? 'Remove PieceInfo (private application data) — none found'
            : `Remove PieceInfo (${summary.pieceInfo} ${
                summary.pieceInfo === 1 ? 'entry' : 'entries'
              } of private application data)`
        }
      />
      <Row
        checked={resetId}
        onChange={onResetId}
        disabled={busy}
        label={
          summary.id
            ? 'Replace the document ID with a new random one'
            : 'Add a random document ID (this file has none)'
        }
        detail={summary.id ? `${summary.id[0]} · ${summary.id[1]}` : undefined}
      />

      {summary.attachments > 0 && (
        <p className="text-xs text-muted">
          {summary.attachments} embedded {summary.attachments === 1 ? 'file' : 'files'} —
          attachments and their own metadata are not modified.
        </p>
      )}
    </section>
  )
}
