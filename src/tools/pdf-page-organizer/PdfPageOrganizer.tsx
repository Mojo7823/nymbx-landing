import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckSquare, Download, RotateCcw, RotateCw, Square, Trash2, Undo2, X } from 'lucide-react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { moveItem } from '../../lib/reorder'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { deletePages, initialPages, rotatePages, type PageState } from './pageOps'
import type { OrganizeWorkerApi } from './organize.worker'

interface LoadedPdf {
  name: string
  size: number
  bytes: Uint8Array
  doc: PDFDocumentProxy
  task: PDFDocumentLoadingTask
  pageCount: number
  /** height / width of page 1 at rotation 0, sizes thumbnail placeholders. */
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

/** Lazy, rotation-aware page thumbnail. */
function PageThumb({
  doc,
  page,
  aspect,
  selected,
  canDelete,
  onToggle,
  onRotate,
  onDelete,
}: {
  doc: PDFDocumentProxy
  page: PageState
  aspect: number
  selected: boolean
  canDelete: boolean
  onToggle: (srcIndex: number) => void
  onRotate: (srcIndex: number) => void
  onDelete: (srcIndex: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)

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
    if (!visible) return
    let cancelled = false
    let renderTask: RenderTask | null = null
    void (async () => {
      const pdfPage = await doc.getPage(page.srcIndex + 1)
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      const rotation = (pdfPage.rotate + page.rotation) % 360
      const base = pdfPage.getViewport({ scale: 1, rotation })
      const scale = 140 / base.width
      const viewport = pdfPage.getViewport({ scale: scale * devicePixelRatio, rotation })
      canvas.width = viewport.width
      canvas.height = viewport.height
      try {
        renderTask = pdfPage.render({ canvas, viewport })
        await renderTask.promise
      } catch {
        /* RenderingCancelledException when rotation changes mid-render */
      }
    })()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [visible, doc, page.srcIndex, page.rotation])

  const displayAspect = page.rotation % 180 === 90 ? 1 / aspect : aspect

  return (
    <div
      className={cx(
        'group flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors',
        selected ? 'border-pine bg-pine/10' : 'border-line bg-card hover:border-line-strong',
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(page.srcIndex)}
        aria-pressed={selected}
        aria-label={`Page ${page.srcIndex + 1}${selected ? ', selected' : ''}`}
        className="w-full cursor-pointer"
      >
        <canvas
          ref={canvasRef}
          style={{ aspectRatio: `1 / ${displayAspect}` }}
          className="w-full rounded-sm bg-white shadow-sm"
        />
      </button>
      <div className="flex w-full items-center justify-between">
        <button
          type="button"
          onClick={() => onRotate(page.srcIndex)}
          aria-label={`Rotate page ${page.srcIndex + 1} 90 degrees clockwise`}
          title="Rotate 90° clockwise"
          className="cursor-pointer rounded p-0.5 text-faint hover:bg-mint hover:text-pine"
        >
          <RotateCw className="size-3.5" />
        </button>
        <span
          className={cx(
            'font-mono text-[10px] tabular-nums',
            selected ? 'font-semibold text-pine' : 'text-muted',
          )}
        >
          {page.srcIndex + 1}
          {page.rotation !== 0 && <span className="ml-0.5 text-amber-badge">{page.rotation}°</span>}
        </span>
        <button
          type="button"
          onClick={() => onDelete(page.srcIndex)}
          disabled={!canDelete}
          aria-label={`Delete page ${page.srcIndex + 1}`}
          title={canDelete ? 'Delete page' : 'The last page cannot be deleted'}
          className="cursor-pointer rounded p-0.5 text-faint hover:bg-red-500/10 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function PdfPageOrganizer() {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [pages, setPages] = useState<PageState[]>([])
  const [history, setHistory] = useState<PageState[][]>([])
  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

  const workerRef = useRef<WorkerHandle<OrganizeWorkerApi> | null>(null)
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

  /** Apply a state change, recording the previous grid for undo. */
  const apply = useCallback(
    (next: PageState[]) => {
      setHistory((h) => [...h.slice(-99), pages])
      setPages(next)
    },
    [pages],
  )

  function undo() {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    setPages(prev)
    setSelection((sel) => {
      const alive = new Set(prev.map((p) => p.srcIndex))
      return new Set([...sel].filter((i) => alive.has(i)))
    })
  }

  async function loadFile(files: File[]) {
    const file = files[0]
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      const next = await openPdf(file)
      void pdf?.task.destroy()
      setPdf(next)
      setPages(initialPages(next.pageCount))
      setHistory([])
      setSelection(new Set())
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
    setPages([])
    setHistory([])
    setSelection(new Set())
    setError(null)
  }

  const toggle = useCallback((srcIndex: number) => {
    setSelection((sel) => {
      const next = new Set(sel)
      if (next.has(srcIndex)) next.delete(srcIndex)
      else next.add(srcIndex)
      return next
    })
  }, [])

  const rotateOne = useCallback(
    (srcIndex: number) => apply(rotatePages(pages, new Set([srcIndex]), 90)),
    [apply, pages],
  )

  const deleteOne = useCallback(
    (srcIndex: number) => {
      const next = deletePages(pages, new Set([srcIndex]))
      if (!next) return
      apply(next)
      setSelection((sel) => {
        const s = new Set(sel)
        s.delete(srcIndex)
        return s
      })
    },
    [apply, pages],
  )

  function rotateSelected(delta: number) {
    if (selection.size === 0) return
    apply(rotatePages(pages, selection, delta))
  }

  function deleteSelected() {
    const next = deletePages(pages, selection)
    if (!next) {
      setError('Cannot delete every page. A PDF needs at least one.')
      return
    }
    setError(null)
    apply(next)
    setSelection(new Set())
  }

  async function save() {
    if (!pdf || saving) return
    setError(null)
    setSaving(true)
    try {
      workerRef.current ??= wrapWorker<OrganizeWorkerApi>(
        new Worker(new URL('./organize.worker.ts', import.meta.url), { type: 'module' }),
      )
      const data = await workerRef.current.api.build(pdf.bytes, pages)
      const base = pdf.name.replace(/\.pdf$/i, '')
      downloadBlob(new Blob([data as BlobPart], { type: 'application/pdf' }), `${base}-edited.pdf`)
    } catch {
      setError('Saving failed. This PDF may use features pdf-lib cannot copy.')
    } finally {
      setSaving(false)
    }
  }

  const allSelected = pdf !== null && selection.size === pages.length
  const changed = history.length > 0

  return (
    <ToolLayout
      title="Page reorder / rotate / delete"
      description="Rearrange a PDF visually: drag page thumbnails into a new order, rotate or delete pages, undo any step, then save a new file. Everything stays in your browser."
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
              hint="One PDF. Pages appear as a drag-to-reorder grid"
            />
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{pdf.name}</p>
              <p className="font-mono text-[11px] text-muted tabular-nums" role="status">
                {pages.length} of {pdf.pageCount} pages · {formatBytes(pdf.size)} · {selection.size}{' '}
                selected
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <Trash2 className="size-3.5" />
              Choose another
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card p-3">
            <Button variant="secondary" size="sm" onClick={undo} disabled={!changed}>
              <Undo2 className="size-3.5" />
              Undo
            </Button>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setSelection(allSelected ? new Set() : new Set(pages.map((p) => p.srcIndex)))
              }
            >
              {allSelected ? <Square className="size-3.5" /> : <CheckSquare className="size-3.5" />}
              {allSelected ? 'Clear selection' : 'Select all'}
            </Button>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => rotateSelected(90)}
              disabled={selection.size === 0}
            >
              <RotateCw className="size-3.5" />
              90°
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => rotateSelected(180)}
              disabled={selection.size === 0}
            >
              <RotateCw className="size-3.5" />
              180°
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => rotateSelected(-90)}
              disabled={selection.size === 0}
            >
              <RotateCcw className="size-3.5" />
              90°
            </Button>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden />
            <Button
              variant="secondary"
              size="sm"
              onClick={deleteSelected}
              disabled={selection.size === 0 || allSelected}
              title={allSelected ? 'A PDF needs at least one page' : undefined}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>

          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <ol
            className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]"
            aria-label="Pages, in output order. Drag to reorder"
          >
            {pages.map((page, index) => (
              <li
                key={page.srcIndex}
                draggable
                onDragStart={(e) => {
                  setDragIndex(index)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragIndex !== null && index !== dropTarget) setDropTarget(index)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIndex !== null && dragIndex !== index)
                    apply(moveItem(pages, dragIndex, index))
                  setDragIndex(null)
                  setDropTarget(null)
                }}
                onDragEnd={() => {
                  setDragIndex(null)
                  setDropTarget(null)
                }}
                className={cx(
                  'cursor-grab',
                  dragIndex === index && 'opacity-50',
                  dropTarget === index && dragIndex !== index && 'ring-2 ring-pine',
                )}
              >
                <PageThumb
                  doc={pdf.doc}
                  page={page}
                  aspect={pdf.aspect}
                  selected={selection.has(page.srcIndex)}
                  canDelete={pages.length > 1}
                  onToggle={toggle}
                  onRotate={rotateOne}
                  onDelete={deleteOne}
                />
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button onClick={() => void save()} disabled={saving}>
              <Download className="size-4" />
              Save as new PDF
            </Button>
            {saving && <ProgressBar className="min-w-40 flex-1" label="Building PDF" />}
            {!changed && !saving && (
              <p className="text-xs text-muted">
                No changes yet; the output would match the original.
              </p>
            )}
          </div>
        </>
      )}
    </ToolLayout>
  )
}
