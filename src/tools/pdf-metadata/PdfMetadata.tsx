import { useCallback, useEffect, useRef, useState } from 'react'
import { transfer } from 'comlink'
import { Eraser, FileDown, RotateCcw, ShieldAlert, Trash2, Wand2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { FileDropzone } from '../../components/FileDropzone'
import { ProgressBar } from '../../components/ProgressBar'
import { ToolLayout } from '../../components/ToolLayout'
import { downloadBlob } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { toast } from '../../lib/toast'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { InfoForm } from './InfoForm'
import { OtherPanel } from './OtherPanel'
import { XmpPanel, type XmpMode } from './XmpPanel'
import { outputFilename } from './filename'
import { fromDatetimeLocal, parsePdfDate, toDatetimeLocal } from './pdfDate'
import { STANDARD_INFO_KEYS, type Changes, type Report, type Summary } from './types'
import type { MetadataWorkerApi } from './metadata.worker'

const MAX_SIZE = 256 * 1024 * 1024
const DATE_KEYS = new Set<string>(['CreationDate', 'ModDate'])
const TRAPPED_VALUES = new Set(['True', 'False', 'Unknown'])

const STRIP_ALL: Changes = {
  info: 'remove',
  xmp: 'remove',
  extraXmp: true,
  pieceInfo: true,
  resetId: true,
}

interface LoadedFile {
  name: string
  size: number
}

interface ApplyResult {
  report: Report
  /** Re-wrapped so the BlobPart type is exact. */
  bytes: Uint8Array<ArrayBuffer>
  filename: string
}

interface FormState {
  values: Record<string, string>
  rawDates: Record<string, string>
  badDates: string[]
}

/** Editable representation of the Info dictionary the file arrived with. */
function formStateFor(summary: Summary): FormState {
  const values: Record<string, string> = {}
  const rawDates: Record<string, string> = {}
  const badDates: string[] = []
  for (const key of STANDARD_INFO_KEYS) {
    const entry = summary.info?.find((candidate) => candidate.key === key)
    const raw = entry?.value ?? ''
    if (DATE_KEYS.has(key)) {
      rawDates[key] = raw
      const date = raw ? parsePdfDate(raw) : null
      values[key] = date ? toDatetimeLocal(date) : ''
      if (raw && !date) badDates.push(key)
    } else if (key === 'Trapped') {
      const name = raw.replace(/^\//, '')
      values[key] = TRAPPED_VALUES.has(name) ? name : ''
    } else {
      values[key] = raw
    }
  }
  return { values, rawDates, badDates }
}

/** Message shown when the worker could not read the file. */
function loadErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return /is encrypted/i.test(message)
    ? 'This PDF is password-protected. Remove the password first; encrypted files are not supported.'
    : 'Could not read this file as a PDF. It may be corrupted or not a PDF at all.'
}

export default function PdfMetadata() {
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [form, setForm] = useState<FormState>({ values: {}, rawDates: {}, badDates: [] })
  const [values, setValues] = useState<Record<string, string>>({})
  const [removedCustom, setRemovedCustom] = useState<string[]>([])
  const [removeInfo, setRemoveInfo] = useState(false)
  const [xmpMode, setXmpMode] = useState<XmpMode>('keep')
  const [extraXmp, setExtraXmp] = useState(false)
  const [pieceInfo, setPieceInfo] = useState(false)
  const [resetId, setResetId] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ApplyResult | null>(null)

  const workerRef = useRef<WorkerHandle<MetadataWorkerApi> | null>(null)
  useEffect(
    () => () => {
      workerRef.current?.terminate()
      workerRef.current = null
    },
    [],
  )

  const worker = useCallback(() => {
    workerRef.current ??= wrapWorker<MetadataWorkerApi>(
      new Worker(new URL('./metadata.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current.api
  }, [])

  function resetControls(next: Summary) {
    const state = formStateFor(next)
    setForm(state)
    setValues(state.values)
    setRemovedCustom([])
    setRemoveInfo(false)
    setXmpMode('keep')
    setExtraXmp(false)
    setPieceInfo(false)
    setResetId(false)
    setResult(null)
  }

  async function openFile(files: File[]) {
    const picked = files[0]
    if (!picked) return
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const buffer = await picked.arrayBuffer()
      const next = await worker().open(transfer(buffer, [buffer]))
      setFile({ name: picked.name, size: picked.size })
      setSummary(next)
      resetControls(next)
    } catch (err) {
      const message = loadErrorMessage(err)
      setFile(null)
      setSummary(null)
      setError(message)
      toast(message, { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  function clearFile() {
    setFile(null)
    setSummary(null)
    setError(null)
    setResult(null)
    void workerRef.current?.api.close()
  }

  function currentChanges(): Changes {
    if (removeInfo) {
      return { info: 'remove', xmp: xmpMode, extraXmp, pieceInfo, resetId }
    }
    const set: Record<string, string> = {}
    const remove: string[] = [...removedCustom]
    for (const key of STANDARD_INFO_KEYS) {
      const value = values[key] ?? ''
      if (value === (form.values[key] ?? '')) continue
      if (value === '') {
        remove.push(key)
      } else if (DATE_KEYS.has(key)) {
        const date = fromDatetimeLocal(value)
        set[key] = date ? date.toISOString() : value
      } else {
        set[key] = value
      }
    }
    return { info: { set, remove }, xmp: xmpMode, extraXmp, pieceInfo, resetId }
  }

  async function apply(changes: Changes) {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    try {
      const { bytes, report } = await worker().apply(changes)
      setResult({
        report,
        // Re-wrap so the BlobPart type is exact (Comlink returns
        // Uint8Array<ArrayBufferLike>).
        bytes: new Uint8Array(bytes),
        filename: outputFilename(file.name, changes),
      })
    } catch {
      const message = 'Could not rewrite this PDF. The file may use features pdf-lib cannot save.'
      setError(message)
      toast(message, { variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  function stripAll() {
    setRemoveInfo(true)
    setXmpMode('remove')
    setExtraXmp(true)
    setPieceInfo(true)
    setResetId(true)
    void apply(STRIP_ALL)
  }

  /** Wrap a control setter so a stale result never outlives the controls. */
  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setResult(null)
      setter(value)
    }
  }

  const setField = edit<{ key: string; value: string }>(({ key, value }) =>
    setValues((current) => ({ ...current, [key]: value })),
  )
  const toggleCustom = edit<string>((key) =>
    setRemovedCustom((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    ),
  )

  const chips: string[] = summary
    ? [
        summary.info === null
          ? 'Info: none'
          : `Info: ${summary.info.length} ${summary.info.length === 1 ? 'key' : 'keys'}` +
            (summary.info.some((entry) => !entry.standard)
              ? ` (${summary.info.filter((entry) => !entry.standard).length} custom)`
              : ''),
        summary.xmp === null ? 'XMP: none' : `XMP: ${formatBytes(summary.xmpBytes)}`,
        ...(summary.extraXmp > 0
          ? [
              `+${summary.extraXmp} XMP ${summary.extraXmp === 1 ? 'stream' : 'streams'} on pages/images`,
            ]
          : []),
        ...(summary.pieceInfo > 0 ? [`PieceInfo: ${summary.pieceInfo}`] : []),
        summary.id ? 'Document ID: set' : 'Document ID: none',
        ...(summary.attachments > 0 ? [`Attachments: ${summary.attachments} (not modified)`] : []),
        ...(summary.orphans > 0
          ? [
              `Unreferenced objects: ${summary.orphans} (earlier ${summary.orphans === 1 ? 'revision' : 'revisions'})`,
            ]
          : []),
      ]
    : []

  const bullets = result ? reportBullets(result.report) : []

  return (
    <ToolLayout
      title="PDF metadata sanitizer"
      description="See exactly what a PDF says about you — edit the Info fields, or strip Info, XMP, PieceInfo and document IDs"
      badge="client-side"
    >
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {!file || !summary ? (
        loading ? (
          <ProgressBar label="Reading PDF…" />
        ) : (
          <FileDropzone
            accept="application/pdf,.pdf"
            maxSize={MAX_SIZE}
            onFiles={(files) => void openFile(files)}
            onReject={() => setError('That file is not a PDF, or is larger than the 256 MB limit.')}
            hint="PDF up to 256 MB"
          />
        )
      ) : (
        <>
          <section className="mb-4 grid overflow-hidden rounded-lg border border-line bg-card sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 border-b border-line p-4 sm:border-r sm:border-b-0">
              <p className="truncate text-sm font-semibold text-ink" title={file.name}>
                {file.name}
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted tabular-nums">
                {formatBytes(summary.bytes)} · {summary.pages}{' '}
                {summary.pages === 1 ? 'page' : 'pages'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center rounded-full border border-line-strong bg-soft px-2 py-0.5 text-[11px] font-medium text-muted"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center p-4">
              <Button variant="ghost" size="sm" onClick={clearFile} disabled={busy}>
                <Trash2 className="size-3.5" />
                Choose another
              </Button>
            </div>
          </section>

          {summary.hasSignature && (
            <p className="mb-4 flex items-start gap-2 rounded-lg border border-line bg-card p-3 text-xs text-amber-badge">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              This PDF contains a digital signature. Any change made here will invalidate it.
            </p>
          )}

          <InfoForm
            info={summary.info}
            values={values}
            onChange={(key, value) => setField({ key, value })}
            rawDates={form.rawDates}
            badDates={form.badDates}
            removedCustom={removedCustom}
            onToggleCustom={toggleCustom}
            removeAll={removeInfo}
            onToggleRemoveAll={edit<boolean>((value) => setRemoveInfo(value))}
            busy={busy}
          />

          <XmpPanel
            xmp={summary.xmp}
            xmpBytes={summary.xmpBytes}
            mode={xmpMode}
            onMode={edit<XmpMode>((mode) => setXmpMode(mode))}
            busy={busy}
            staleCopies={extraXmp ? 0 : summary.extraXmp}
          />

          <OtherPanel
            summary={summary}
            extraXmp={extraXmp}
            onExtraXmp={edit<boolean>((value) => setExtraXmp(value))}
            pieceInfo={pieceInfo}
            onPieceInfo={edit<boolean>((value) => setPieceInfo(value))}
            resetId={resetId}
            onResetId={edit<boolean>((value) => setResetId(value))}
            busy={busy}
          />

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button onClick={() => void apply(currentChanges())} disabled={busy}>
              <Wand2 className="size-4" />
              Apply changes
            </Button>
            <Button variant="secondary" onClick={stripAll} disabled={busy}>
              <Eraser className="size-4" />
              Strip all metadata
            </Button>
            <Button variant="ghost" onClick={() => resetControls(summary)} disabled={busy}>
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
            {busy && <ProgressBar className="min-w-40 flex-1" label="Rewriting PDF…" />}
          </div>

          {result && !busy && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-card p-4">
              <p className="font-mono text-sm text-ink tabular-nums" role="status">
                {formatBytes(result.report.before)} → {formatBytes(result.report.after)}{' '}
                <span
                  className={
                    result.report.after <= result.report.before ? 'text-pine' : 'text-amber-badge'
                  }
                >
                  ({result.report.after > result.report.before ? '+' : '−'}
                  {Math.abs(
                    Math.round(
                      ((result.report.after - result.report.before) / result.report.before) * 100,
                    ),
                  )}
                  %)
                </span>
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted">
                {bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              <p className="font-mono text-xs break-all text-ink">{result.filename}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() =>
                    downloadBlob(
                      new Blob([result.bytes], { type: 'application/pdf' }),
                      result.filename,
                    )
                  }
                >
                  <FileDown className="size-4" />
                  Download
                </Button>
                <span className="text-xs text-muted">
                  Check the result in another viewer before deleting the original.
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </ToolLayout>
  )
}

/** Human-readable list of what the apply actually did. */
function reportBullets(report: Report): string[] {
  const bullets: string[] = []
  if (report.infoDictRemoved) bullets.push('Info dictionary removed')
  if (report.infoSet.length > 0) bullets.push(`${report.infoSet.join(', ')} set`)
  if (report.infoRemoved.length > 0) bullets.push(`${report.infoRemoved.join(', ')} removed`)
  if (report.xmp === 'removed') bullets.push('XMP packet removed')
  if (report.xmp === 'regenerated') bullets.push('XMP packet rewritten from the fields above')
  if (report.xmp === 'created') bullets.push('XMP packet created from the fields above')
  if (report.xmp === 'kept') bullets.push('XMP packet kept as it was')
  if (report.extraXmpRemoved > 0) {
    bullets.push(
      `${report.extraXmpRemoved} extra XMP ${
        report.extraXmpRemoved === 1 ? 'stream' : 'streams'
      } removed`,
    )
  }
  if (report.pieceInfoRemoved > 0) {
    bullets.push(
      `${report.pieceInfoRemoved} PieceInfo ${
        report.pieceInfoRemoved === 1 ? 'entry' : 'entries'
      } removed`,
    )
  }
  if (report.idReset) bullets.push('Document ID replaced')
  bullets.push(
    report.orphansRemoved > 0
      ? `${report.orphansRemoved} unreferenced ${
          report.orphansRemoved === 1 ? 'object' : 'objects'
        } from earlier revisions removed`
      : 'Earlier revisions of the file were not carried over',
  )
  if (report.signatureInvalidated) bullets.push('The digital signature is no longer valid')
  return bullets
}
