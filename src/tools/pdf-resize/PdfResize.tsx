import { useEffect, useRef, useState } from 'react'
import { Download, FileWarning, Scaling, Trash2 } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { fromPoints, pagePresets, toPoints, type ResizeMode, type Unit } from './resizeMath'
import type { ImagePage, PdfInfo, PdfResizeWorkerApi } from './pdfResize.worker'

interface LoadedPdf {
  name: string
  size: number
  bytes: Uint8Array
  info: PdfInfo
}

type Operation = 'resize' | 'compress'

const DPI_CHOICES = [72, 96, 150, 300]

/** Render every page to a JPEG via pdf.js (used by reduce-file-size mode). */
async function renderPagesToJpeg(
  bytes: Uint8Array,
  dpi: number,
  quality: number,
  onProgress: (done: number, total: number) => void,
): Promise<ImagePage[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const task = pdfjs.getDocument({ data: bytes.slice() })
  try {
    const doc = await task.promise
    const pages: ImagePage[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: dpi / 72 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          'image/jpeg',
          quality,
        ),
      )
      canvas.width = 0 // release backing store promptly
      pages.push({
        jpg: new Uint8Array(await blob.arrayBuffer()),
        width: base.width,
        height: base.height,
      })
      onProgress(i, doc.numPages)
    }
    return pages
  } finally {
    void task.destroy()
  }
}

export default function PdfResize() {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [operation, setOperation] = useState<Operation>('resize')
  const [presetId, setPresetId] = useState('a4')
  const [customW, setCustomW] = useState(210)
  const [customH, setCustomH] = useState(297)
  const [unit, setUnit] = useState<Unit>('mm')
  const [mode, setMode] = useState<ResizeMode>('fit')
  const [autoRotate, setAutoRotate] = useState(true)
  const [dpi, setDpi] = useState(150)
  const [quality, setQuality] = useState(0.8)
  const [busy, setBusy] = useState<null | { done: number; total: number }>(null)
  const [result, setResult] = useState<null | { blob: Blob; label: string; filename: string }>(null)

  const workerRef = useRef<WorkerHandle<PdfResizeWorkerApi> | null>(null)
  useEffect(() => () => workerRef.current?.terminate(), [])

  function getWorker() {
    workerRef.current ??= wrapWorker<PdfResizeWorkerApi>(
      new Worker(new URL('./pdfResize.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current
  }

  // Any input change invalidates a previously produced result.
  useEffect(() => {
    setResult(null)
  }, [operation, presetId, customW, customH, unit, mode, autoRotate, dpi, quality, pdf])

  async function loadFile(files: File[]) {
    const file = files[0]
    if (!file) return
    setError(null)
    setBusy({ done: 0, total: 1 })
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const info = await getWorker().api.inspect(bytes)
      setPdf({ name: file.name, size: file.size, bytes, info })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setError(
        /encrypt/i.test(message)
          ? 'This PDF is password-protected. Remove the password first — encrypted files are not supported.'
          : 'Could not read this file as a PDF. It may be corrupted or not a PDF at all.',
      )
    } finally {
      setBusy(null)
    }
  }

  const target =
    presetId === 'custom'
      ? { width: toPoints(customW, unit), height: toPoints(customH, unit) }
      : (() => {
          const p = pagePresets.find((p) => p.id === presetId)!
          return { width: p.width, height: p.height }
        })()
  const targetValid = target.width > 0 && target.height > 0

  const baseName = pdf ? pdf.name.replace(/\.pdf$/i, '') : ''

  async function run() {
    if (!pdf || !targetValid) return
    setError(null)
    setBusy({ done: 0, total: operation === 'compress' ? pdf.info.pageCount : 1 })
    try {
      if (operation === 'resize') {
        const data = await getWorker().api.resize(pdf.bytes, {
          targetWidth: target.width,
          targetHeight: target.height,
          mode,
          autoRotate,
        })
        const blob = new Blob([data as BlobPart], { type: 'application/pdf' })
        setResult({
          blob,
          filename: `${baseName}-resized.pdf`,
          label: `${formatBytes(pdf.size)} → ${formatBytes(blob.size)}`,
        })
      } else {
        const pages = await renderPagesToJpeg(pdf.bytes, dpi, quality, (done, total) =>
          setBusy({ done, total }),
        )
        const data = await getWorker().api.assembleImagePdf(pages)
        const blob = new Blob([data as BlobPart], { type: 'application/pdf' })
        setResult({
          blob,
          filename: `${baseName}-compressed.pdf`,
          label: `${formatBytes(pdf.size)} → ${formatBytes(blob.size)}`,
        })
      }
    } catch {
      setError('Processing failed — this PDF may use features that cannot be converted.')
    } finally {
      setBusy(null)
    }
  }

  const firstPage = pdf?.info.pages[0]

  return (
    <ToolLayout
      title="PDF resize"
      description="Change a PDF's page size to a standard format or custom dimensions — scaling content to fit or cropping/padding around it — or shrink the file by re-rendering pages. All in your browser."
      badge="client-side"
    >
      {!pdf ? (
        <>
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {busy ? (
            <ProgressBar label="Reading PDF" />
          ) : (
            <FileDropzone
              accept="application/pdf,.pdf"
              onFiles={(files) => void loadFile(files)}
              hint="One PDF at a time"
            />
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{pdf.name}</p>
              <p className="font-mono text-[11px] text-muted tabular-nums">
                {pdf.info.pageCount} {pdf.info.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                {formatBytes(pdf.size)}
                {firstPage &&
                  ` · ${Math.round(fromPoints(firstPage.width, 'mm'))} × ${Math.round(
                    fromPoints(firstPage.height, 'mm'),
                  )} mm`}
                {pdf.info.mixedOrientation && ' · mixed orientations'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPdf(null)
                setError(null)
              }}
            >
              <Trash2 className="size-3.5" />
              Choose another
            </Button>
          </div>

          <div className="mb-4 flex flex-col gap-4 rounded-lg border border-line bg-card p-4">
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <legend className="sr-only">Operation</legend>
              {(
                [
                  ['resize', 'Resize pages'],
                  ['compress', 'Reduce file size'],
                ] as const
              ).map(([op, label]) => (
                <label
                  key={op}
                  className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink"
                >
                  <input
                    type="radio"
                    name="operation"
                    checked={operation === op}
                    onChange={() => setOperation(op)}
                    className="size-3.5 accent-(--color-pine)"
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            {operation === 'resize' ? (
              <>
                <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted">Page size</span>
                    <select
                      value={presetId}
                      onChange={(e) => setPresetId(e.target.value)}
                      className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
                    >
                      {pagePresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} ({Math.round(fromPoints(p.width, 'mm'))} ×{' '}
                          {Math.round(fromPoints(p.height, 'mm'))} mm)
                        </option>
                      ))}
                      <option value="custom">Custom…</option>
                    </select>
                  </label>
                  {presetId === 'custom' && (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted">Width</span>
                        <input
                          type="number"
                          min={1}
                          value={customW}
                          onChange={(e) => setCustomW(Number(e.target.value) || 0)}
                          className="h-8 w-24 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted">Height</span>
                        <input
                          type="number"
                          min={1}
                          value={customH}
                          onChange={(e) => setCustomH(Number(e.target.value) || 0)}
                          className="h-8 w-24 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-muted">Unit</span>
                        <select
                          value={unit}
                          onChange={(e) => setUnit(e.target.value as Unit)}
                          className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
                        >
                          <option value="mm">mm</option>
                          <option value="in">inches</option>
                          <option value="pt">points</option>
                        </select>
                      </label>
                    </>
                  )}
                </div>

                <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <legend className="sr-only">Content handling</legend>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink">
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === 'fit'}
                      onChange={() => setMode('fit')}
                      className="size-3.5 accent-(--color-pine)"
                    />
                    Scale content to fit
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink">
                    <input
                      type="radio"
                      name="mode"
                      checked={mode === 'crop-pad'}
                      onChange={() => setMode('crop-pad')}
                      className="size-3.5 accent-(--color-pine)"
                    />
                    Keep size, crop / pad
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink">
                    <input
                      type="checkbox"
                      checked={autoRotate}
                      onChange={(e) => setAutoRotate(e.target.checked)}
                      className="size-3.5 accent-(--color-pine)"
                    />
                    Match page orientation
                  </label>
                </fieldset>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted">Render DPI</span>
                    <select
                      value={dpi}
                      onChange={(e) => setDpi(Number(e.target.value))}
                      className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
                    >
                      {DPI_CHOICES.map((d) => (
                        <option key={d} value={d}>
                          {d} DPI
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex min-w-40 flex-col gap-1">
                    <span className="text-xs font-medium text-muted">
                      JPEG quality · {Math.round(quality * 100)}%
                    </span>
                    <input
                      type="range"
                      min={30}
                      max={95}
                      value={Math.round(quality * 100)}
                      onChange={(e) => setQuality(Number(e.target.value) / 100)}
                      className="accent-(--color-pine)"
                    />
                  </label>
                </div>
                <p className="flex items-start gap-1.5 text-xs text-amber-badge">
                  <FileWarning className="mt-0.5 size-3.5 shrink-0" />
                  Pages are re-rendered as images: text becomes non-selectable and non-searchable.
                  Best for scanned or image-heavy documents.
                </p>
              </>
            )}
          </div>

          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button onClick={() => void run()} disabled={!!busy || !targetValid}>
              <Scaling className="size-4" />
              {operation === 'resize' ? 'Resize PDF' : 'Compress PDF'}
            </Button>
            {busy && (
              <ProgressBar
                className="min-w-40 flex-1"
                value={busy.total === 0 ? 100 : (busy.done / busy.total) * 100}
                label={
                  operation === 'resize' ? 'Resizing' : `Rendering page ${busy.done}/${busy.total}`
                }
              />
            )}
            {result && !busy && (
              <>
                <span className="font-mono text-xs text-muted tabular-nums" role="status">
                  {result.label}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => downloadBlob(result.blob, result.filename)}
                >
                  <Download className="size-4" />
                  Download
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </ToolLayout>
  )
}
