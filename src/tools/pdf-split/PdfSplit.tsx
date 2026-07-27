import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { proxy } from 'comlink'
import { FileOutput, FolderArchive, Trash2 } from 'lucide-react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { formatPageRanges, parsePageRanges } from '../../lib/pageRanges'
import type { PdfWorkerApi } from './pdf.worker'

interface LoadedPdf {
  name: string
  size: number
  bytes: Uint8Array
  doc: PDFDocumentProxy
  /** Kept so the pdf.js document (and its worker memory) can be released. */
  task: PDFDocumentLoadingTask
  pageCount: number
  /** height / width of page 1, used to size thumbnail placeholders. */
  aspect: number
}

async function openPdf(file: File): Promise<LoadedPdf> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const bytes = new Uint8Array(await file.arrayBuffer())
  // pdf.js transfers the buffer it is given — hand it a copy, keep the original.
  const task = pdfjs.getDocument({ data: bytes.slice() })
  const doc = await task.promise
  const page1 = await doc.getPage(1)
  const viewport = page1.getViewport({ scale: 1 })
  return {
    name: file.name,
    size: file.size,
    bytes,
    doc,
    task,
    pageCount: doc.numPages,
    aspect: viewport.height / viewport.width,
  }
}

/** One thumbnail cell; renders its canvas only once scrolled into view. */
function PageThumb({
  doc,
  pageNumber,
  aspect,
  selected,
  onToggle,
}: {
  doc: PDFDocumentProxy
  pageNumber: number
  aspect: number
  selected: boolean
  onToggle: (page: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const rendered = useRef(false)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setVisible(true),
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || rendered.current) return
    rendered.current = true
    let cancelled = false
    void (async () => {
      const page = await doc.getPage(pageNumber)
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      const scale = 140 / page.getViewport({ scale: 1 }).width
      const viewport = page.getViewport({ scale: scale * devicePixelRatio })
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, viewport }).promise
    })()
    return () => {
      cancelled = true
    }
  }, [visible, doc, pageNumber])

  return (
    <button
      type="button"
      onClick={() => onToggle(pageNumber)}
      aria-pressed={selected}
      aria-label={`Page ${pageNumber}`}
      className={cx(
        'group flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors',
        selected ? 'border-pine bg-pine/10' : 'border-line bg-card hover:border-line-strong',
      )}
    >
      <canvas
        ref={canvasRef}
        style={{ aspectRatio: `1 / ${aspect}` }}
        className="w-full rounded-sm bg-white shadow-sm"
      />
      <span
        className={cx(
          'font-mono text-[10px] tabular-nums',
          selected ? 'font-semibold text-pine' : 'text-muted',
        )}
      >
        {pageNumber}
      </span>
    </button>
  )
}

export default function PdfSplit() {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rangeText, setRangeText] = useState('')
  const [busy, setBusy] = useState<null | { label: string; done: number; total: number }>(null)

  const workerRef = useRef<WorkerHandle<PdfWorkerApi> | null>(null)

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      void pdf?.task.destroy()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  function getWorker() {
    workerRef.current ??= wrapWorker<PdfWorkerApi>(
      new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current
  }

  const parsed = useMemo(
    () => (pdf ? parsePageRanges(rangeText, pdf.pageCount) : { pages: [] }),
    [rangeText, pdf],
  )
  const selected = useMemo(() => new Set(parsed.pages), [parsed])

  const toggle = useCallback(
    (page: number) => {
      const next = new Set(selected)
      if (next.has(page)) next.delete(page)
      else next.add(page)
      setRangeText(formatPageRanges([...next]))
    },
    [selected],
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
      setRangeText('')
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      setError(
        name === 'PasswordException'
          ? 'This PDF is password-protected. Remove the password before splitting it; encrypted files are not supported.'
          : 'Could not read this file as a PDF. It may be corrupted or not a PDF at all.',
      )
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    void pdf?.task.destroy()
    setPdf(null)
    setRangeText('')
    setError(null)
  }

  const baseName = pdf ? pdf.name.replace(/\.pdf$/i, '') : ''

  async function extractSelection() {
    if (!pdf || parsed.pages.length === 0) return
    setBusy({ label: 'Extracting', done: 0, total: 1 })
    try {
      const data = await getWorker().api.extract(pdf.bytes, parsed.pages)
      downloadBlob(
        new Blob([data as BlobPart], { type: 'application/pdf' }),
        `${baseName}-pages.pdf`,
      )
    } catch {
      setError('Extracting failed. This PDF may use features pdf-lib cannot copy.')
    } finally {
      setBusy(null)
    }
  }

  async function splitAll() {
    if (!pdf) return
    setBusy({ label: 'Splitting', done: 0, total: pdf.pageCount })
    try {
      const onProgress = proxy((done: number, total: number) =>
        setBusy({ label: 'Splitting', done, total }),
      )
      const blob = await getWorker().api.splitAll(pdf.bytes, baseName, onProgress)
      downloadBlob(blob, `${baseName}-split.zip`)
    } catch {
      setError('Splitting failed. This PDF may use features pdf-lib cannot copy.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <ToolLayout
      title="PDF split / extract"
      description="Pick pages from a PDF by clicking thumbnails or typing ranges, extract them into a new file, or split every page into its own PDF. Everything stays in your browser."
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
              hint="One PDF at a time. Pages render as clickable thumbnails"
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

          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-line bg-card p-4">
            <label className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-xs font-medium text-muted">Pages</span>
              <input
                type="text"
                value={rangeText}
                onChange={(e) => setRangeText(e.target.value)}
                placeholder={`e.g. 1-3,7,9-  (of ${pdf.pageCount})`}
                spellCheck={false}
                className="h-8 min-w-0 flex-1 basis-52 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setRangeText(
                    formatPageRanges(Array.from({ length: pdf.pageCount }, (_, i) => i + 1)),
                  )
                }
              >
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRangeText('')}>
                Clear
              </Button>
            </label>
            {parsed.error ? (
              <p role="alert" className="font-mono text-xs text-red-600 dark:text-red-400">
                {parsed.error}
              </p>
            ) : (
              <p className="font-mono text-[11px] text-muted tabular-nums" role="status">
                {parsed.pages.length} of {pdf.pageCount} pages selected
              </p>
            )}
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
            {Array.from({ length: pdf.pageCount }, (_, i) => (
              <PageThumb
                key={i + 1}
                doc={pdf.doc}
                pageNumber={i + 1}
                aspect={pdf.aspect}
                selected={selected.has(i + 1)}
                onToggle={toggle}
              />
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button
              onClick={() => void extractSelection()}
              disabled={parsed.pages.length === 0 || !!parsed.error || !!busy}
            >
              <FileOutput className="size-4" />
              Extract {parsed.pages.length > 0 ? `${parsed.pages.length} ` : ''}selected
            </Button>
            <Button variant="secondary" onClick={() => void splitAll()} disabled={!!busy}>
              <FolderArchive className="size-4" />
              Split all pages to zip
            </Button>
            {busy && (
              <ProgressBar
                className="min-w-40 flex-1"
                value={busy.total === 0 ? 100 : (busy.done / busy.total) * 100}
                label={busy.label}
              />
            )}
          </div>
        </>
      )}
    </ToolLayout>
  )
}
