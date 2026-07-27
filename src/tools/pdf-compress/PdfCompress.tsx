import { useEffect, useRef, useState } from 'react'
import { FileDown, FileWarning, Shrink, Trash2 } from 'lucide-react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { compareSizes } from './stats'
import type { CompressWorkerApi } from './compress.worker'

interface LoadedPdf {
  name: string
  size: number
  doc: PDFDocumentProxy
  /** Kept so the pdf.js document (and its worker memory) can be released. */
  task: PDFDocumentLoadingTask
  pageCount: number
}

interface CompressResult {
  blob: Blob
  dpi: number
  quality: number
}

const DPI_CHOICES = [72, 96, 150, 200, 300]

async function openPdf(file: File): Promise<LoadedPdf> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  return { name: file.name, size: file.size, doc, task, pageCount: doc.numPages }
}

/** Render one page to a JPEG blob at the given DPI. */
async function renderPageToJpeg(
  doc: PDFDocumentProxy,
  pageNumber: number,
  dpi: number,
  quality: number,
): Promise<{ blob: Blob; widthPt: number; heightPt: number }> {
  const page = await doc.getPage(pageNumber)
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
  return { blob, widthPt: base.width, heightPt: base.height }
}

export default function PdfCompress() {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dpi, setDpi] = useState(150)
  const [quality, setQuality] = useState(0.6)
  const [busy, setBusy] = useState<null | { done: number; total: number }>(null)
  const [result, setResult] = useState<CompressResult | null>(null)

  const workerRef = useRef<WorkerHandle<CompressWorkerApi> | null>(null)
  const pdfRef = useRef<LoadedPdf | null>(null)
  useEffect(() => {
    pdfRef.current = pdf
  }, [pdf])

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      void pdfRef.current?.task.destroy()
    },
    [],
  )

  async function loadFile(files: File[]) {
    const file = files[0]
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      const next = await openPdf(file)
      void pdf?.task.destroy()
      setPdf(next)
      setResult(null)
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      setError(
        name === 'PasswordException'
          ? 'This PDF is password-protected. Remove the password first; encrypted files are not supported.'
          : 'Could not read this file as a PDF. It may be corrupted or not a PDF at all.',
      )
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    void pdf?.task.destroy()
    setPdf(null)
    setError(null)
    setResult(null)
  }

  async function compress() {
    if (!pdf || busy) return
    setError(null)
    setResult(null)
    setBusy({ done: 0, total: pdf.pageCount })
    try {
      workerRef.current ??= wrapWorker<CompressWorkerApi>(
        new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' }),
      )
      const api = workerRef.current.api
      await api.start()
      for (let n = 1; n <= pdf.pageCount; n++) {
        const { blob, widthPt, heightPt } = await renderPageToJpeg(pdf.doc, n, dpi, quality)
        await api.addPage(new Uint8Array(await blob.arrayBuffer()), widthPt, heightPt)
        setBusy({ done: n, total: pdf.pageCount })
      }
      const bytes = await api.finish()
      setResult({
        blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        dpi,
        quality,
      })
    } catch {
      setError('Compression failed. This PDF may use features pdf.js cannot draw.')
    } finally {
      setBusy(null)
    }
  }

  const baseName = pdf ? pdf.name.replace(/\.pdf$/i, '') : ''
  const comparison = pdf && result ? compareSizes(pdf.size, result.blob.size) : null

  const selectClass =
    'h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none'

  return (
    <ToolLayout
      title="PDF compress"
      description="Shrink scanned or image-heavy PDFs by re-rendering every page as a JPEG at a chosen resolution. Everything stays in your browser."
      badge="client-side"
    >
      {!pdf ? (
        <>
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {loading ? (
            <ProgressBar label="Reading PDF" />
          ) : (
            <FileDropzone
              accept="application/pdf,.pdf"
              onFiles={(files) => void loadFile(files)}
              hint="Works best on scanned documents and image-heavy PDFs"
            />
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{pdf.name}</p>
              <p className="font-mono text-[11px] text-muted tabular-nums">
                {pdf.pageCount} {pdf.pageCount === 1 ? 'page' : 'pages'} · {formatBytes(pdf.size)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <Trash2 className="size-3.5" />
              Choose another
            </Button>
          </div>

          <div className="mb-4 flex flex-col gap-4 rounded-lg border border-line bg-card p-4">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Resolution</span>
                <select
                  value={dpi}
                  onChange={(e) => setDpi(Number(e.target.value))}
                  className={selectClass}
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
              Pages are re-rendered as flat images: text becomes non-selectable, and links,
              bookmarks and form fields are removed. Compression only helps scanned or image-heavy
              documents; text-only PDFs usually get bigger.
            </p>
          </div>

          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button onClick={() => void compress()} disabled={!!busy}>
              <Shrink className="size-4" />
              Compress {pdf.pageCount} {pdf.pageCount === 1 ? 'page' : 'pages'}
            </Button>
            {busy && (
              <ProgressBar
                className="min-w-40 flex-1"
                value={(busy.done / busy.total) * 100}
                label={`Rendering page ${busy.done}/${busy.total}`}
              />
            )}
          </div>

          {result && comparison && !busy && (
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-card p-4">
              <p className="font-mono text-sm text-ink tabular-nums" role="status">
                {formatBytes(pdf.size)} → {formatBytes(result.blob.size)}{' '}
                <span className={comparison.smaller ? 'text-pine' : 'text-amber-badge'}>
                  ({comparison.percentChange > 0 ? '+' : ''}
                  {comparison.percentChange.toFixed(0)}%)
                </span>
              </p>
              {comparison.smaller ? (
                <p className="text-xs text-muted">
                  Rendered at {result.dpi} DPI, JPEG quality {Math.round(result.quality * 100)}%.
                  Check the result is legible before deleting the original.
                </p>
              ) : (
                <p className="flex items-start gap-1.5 text-xs text-amber-badge">
                  <FileWarning className="mt-0.5 size-3.5 shrink-0" />
                  The result is not smaller than the original. This PDF is probably text or vector
                  based, so rasterizing cannot shrink it. Keep the original file.
                </p>
              )}
              <div>
                <Button
                  variant={comparison.smaller ? 'primary' : 'secondary'}
                  onClick={() => downloadBlob(result.blob, `${baseName}-compressed.pdf`)}
                >
                  <FileDown className="size-4" />
                  Download compressed PDF
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </ToolLayout>
  )
}
