import { useEffect, useRef, useState } from 'react'
import { proxy } from 'comlink'
import { ArrowDown, ArrowUp, Combine, FilePlus, GripVertical, Trash2, X } from 'lucide-react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { moveItem } from '../../lib/reorder'
import type { MergeWorkerApi } from './merge.worker'

interface PdfItem {
  id: number
  name: string
  size: number
  bytes: Uint8Array
  pageCount: number
  /** height / width of page 1, used to size the thumbnail. */
  aspect: number
  doc: PDFDocumentProxy
  /** Kept so the pdf.js document (and its worker memory) can be released. */
  task: PDFDocumentLoadingTask
}

let nextId = 1

async function openPdf(file: File): Promise<PdfItem> {
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
    id: nextId++,
    name: file.name,
    size: file.size,
    bytes,
    pageCount: doc.numPages,
    aspect: viewport.height / viewport.width,
    doc,
    task,
  }
}

/** First-page thumbnail, rendered on mount. */
function FirstPageThumb({ doc, aspect }: { doc: PDFDocumentProxy; aspect: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // No run-once ref guard: StrictMode's double-mount would permanently skip
  // the second run. The cancelled flag alone prevents overlapping renders.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const page = await doc.getPage(1)
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      const scale = 96 / page.getViewport({ scale: 1 }).width
      const viewport = page.getViewport({ scale: scale * devicePixelRatio })
      canvas.width = viewport.width
      canvas.height = viewport.height
      await page.render({ canvas, viewport }).promise
    })()
    return () => {
      cancelled = true
    }
  }, [doc])

  return (
    <canvas
      ref={canvasRef}
      style={{ aspectRatio: `1 / ${aspect}` }}
      className="w-16 shrink-0 rounded-sm bg-white shadow-sm sm:w-20"
    />
  )
}

export default function PdfMerge() {
  const [items, setItems] = useState<PdfItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [merging, setMerging] = useState<null | { done: number; total: number }>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const addInputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<WorkerHandle<MergeWorkerApi> | null>(null)
  // Mirrors `items` so the unmount cleanup below can release every document.
  const itemsRef = useRef<PdfItem[]>([])
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      for (const item of itemsRef.current) void item.task.destroy()
    },
    [],
  )

  async function addFiles(files: File[]) {
    setError(null)
    setLoading(true)
    const failed: string[] = []
    const opened: PdfItem[] = []
    for (const file of files) {
      try {
        opened.push(await openPdf(file))
      } catch (err) {
        const name = err instanceof Error ? err.name : ''
        failed.push(
          name === 'PasswordException'
            ? `${file.name} is password-protected. Remove the password first; encrypted PDFs are not supported.`
            : `${file.name} could not be read as a PDF.`,
        )
      }
    }
    setItems((prev) => [...prev, ...opened])
    if (failed.length > 0) setError(failed.join(' '))
    setLoading(false)
  }

  function removeItem(index: number) {
    setItems((prev) => {
      const item = prev[index]
      if (item) void item.task.destroy()
      return prev.filter((_, i) => i !== index)
    })
  }

  function clearAll() {
    for (const item of items) void item.task.destroy()
    setItems([])
    setError(null)
  }

  function move(from: number, to: number) {
    setItems((prev) => moveItem(prev, from, to))
  }

  async function merge() {
    if (items.length < 2 || merging) return
    setError(null)
    setMerging({ done: 0, total: items.length })
    try {
      workerRef.current ??= wrapWorker<MergeWorkerApi>(
        new Worker(new URL('./merge.worker.ts', import.meta.url), { type: 'module' }),
      )
      const onProgress = proxy((done: number, total: number) => setMerging({ done, total }))
      const data = await workerRef.current.api.merge(
        items.map((i) => i.bytes),
        onProgress,
      )
      downloadBlob(new Blob([data as BlobPart], { type: 'application/pdf' }), 'merged.pdf')
    } catch {
      setError('Merging failed. One of these PDFs may use features pdf-lib cannot copy.')
    } finally {
      setMerging(null)
    }
  }

  const totalPages = items.reduce((n, i) => n + i.pageCount, 0)
  const totalBytes = items.reduce((n, i) => n + i.size, 0)

  return (
    <ToolLayout
      title="PDF merge"
      description="Combine several PDFs into one. Drag the documents into the order you want. The merged file follows it exactly. Everything stays in your browser."
      badge="client-side"
    >
      {items.length === 0 ? (
        <>
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {loading ? (
            <ProgressBar label="Reading PDFs" />
          ) : (
            <FileDropzone
              accept="application/pdf,.pdf"
              multiple
              onFiles={(files) => void addFiles(files)}
              hint="Two or more PDFs. You can reorder them before merging"
            />
          )}
        </>
      ) : (
        <>
          <ol className="flex flex-col gap-2" aria-label="Documents to merge, in order">
            {items.map((item, index) => (
              <li
                key={item.id}
                draggable
                onDragStart={(e) => {
                  setDragIndex(index)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragIndex !== null && index !== dropIndex) setDropIndex(index)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIndex !== null) move(dragIndex, index)
                  setDragIndex(null)
                  setDropIndex(null)
                }}
                onDragEnd={() => {
                  setDragIndex(null)
                  setDropIndex(null)
                }}
                className={cx(
                  'flex items-center gap-3 rounded-lg border bg-card p-3',
                  dragIndex === index && 'opacity-50',
                  dropIndex === index && dragIndex !== index
                    ? 'border-pine bg-mint'
                    : 'border-line',
                )}
              >
                <GripVertical className="size-4 shrink-0 cursor-grab text-faint" aria-hidden />
                <span className="w-6 shrink-0 text-center font-mono text-xs font-semibold text-pine tabular-nums">
                  {index + 1}
                </span>
                <FirstPageThumb doc={item.doc} aspect={item.aspect} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                  <p className="font-mono text-[11px] text-muted tabular-nums">
                    {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'} ·{' '}
                    {formatBytes(item.size)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => move(index, index - 1)}
                    disabled={index === 0}
                    aria-label={`Move ${item.name} up`}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => move(index, index + 1)}
                    disabled={index === items.length - 1}
                    aria-label={`Move ${item.name} down`}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem(index)}
                    aria-label={`Remove ${item.name}`}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => addInputRef.current?.click()}>
              <FilePlus className="size-3.5" />
              Add more
            </Button>
            <input
              ref={addInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files) void addFiles(Array.from(e.target.files))
                e.target.value = ''
              }}
            />
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <Trash2 className="size-3.5" />
              Clear all
            </Button>
            {loading && <ProgressBar className="min-w-32 flex-1" label="Reading PDFs" />}
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button onClick={() => void merge()} disabled={items.length < 2 || !!merging}>
              <Combine className="size-4" />
              Merge {items.length} {items.length === 1 ? 'PDF' : 'PDFs'}
            </Button>
            <p className="font-mono text-[11px] text-muted tabular-nums" role="status">
              {totalPages} {totalPages === 1 ? 'page' : 'pages'} · {formatBytes(totalBytes)} total
            </p>
            {merging && (
              <ProgressBar
                className="min-w-40 flex-1"
                value={(merging.done / merging.total) * 100}
                label="Merging"
              />
            )}
          </div>
          {items.length === 1 && (
            <p className="mt-2 text-xs text-muted">Add at least one more PDF to merge.</p>
          )}
        </>
      )}
    </ToolLayout>
  )
}
