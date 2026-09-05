import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Check as CheckIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  MousePointer2,
  PenLine,
  PenTool,
  Redo2,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { toast } from '../../lib/toast'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { Editor, PREVIEW_FONT, type EditorTool } from './Editor'
import { SignaturePad } from './SignaturePad'
import { Thumbnails } from './Thumbnails'
import { exportPlan } from './exportPlan'
import { scaleStrokes, strokeBounds, translateStrokes, type InkStroke } from './ink'
import { openPdf, pdfErrorMessage, type LoadedPdf } from './pdfDoc'
import {
  amend,
  appendInk,
  canRedo,
  canUndo,
  clampToPage,
  commit,
  createCheck,
  createImage,
  createInk,
  createText,
  DATE_FORMATS,
  emptyHistory,
  formatDate,
  redo,
  removeObject,
  replaceObject,
  undo,
  type DateFormat,
  type History,
  type SignObject,
  type TextObject,
} from './objects'
import type { ImageAsset, SignWorkerApi } from './sign.worker'

const FONT_URL = '/fonts/NotoSansTC-Regular.ttf'
const FONT_FAMILY = 'NYMBX Sign'
const FONT_STYLE_ID = 'nymbx-sign-font'
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const INK_MERGE_MS = 600
const DEFAULT_TEXT_SIZE = 16
const DEFAULT_CHECK_SIZE = 28
const SIGNATURE_PAGE_SHARE = 0.3

interface StoredImage {
  bytes: Uint8Array
  type: 'png' | 'jpeg'
  url: string
  width: number
  height: number
}

let measureCanvas: HTMLCanvasElement | null = null
/** Width of `text` at `size` points in the preview font (points). */
function measureTextWidth(text: string, size: number): number {
  measureCanvas ??= document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) return size * Math.max(text.length, 1) * 0.5
  ctx.font = `${size}px ${PREVIEW_FONT}`
  const widest = Math.max(
    ...text.split('\n').map((line) => ctx.measureText(line === '' ? ' ' : line).width),
  )
  return Math.max(widest, size)
}

/** Load the export font into the document so the preview uses the same metrics. */
function usePreviewFont(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!document.getElementById(FONT_STYLE_ID)) {
      const style = document.createElement('style')
      style.id = FONT_STYLE_ID
      style.textContent = `@font-face{font-family:'${FONT_FAMILY}';src:url('${FONT_URL}') format('truetype');font-display:block}`
      document.head.appendChild(style)
    }
    let cancelled = false
    void document.fonts
      .load(`16px "${FONT_FAMILY}"`)
      .catch(() => undefined)
      .then(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [])
  return ready
}

async function toPngOrJpeg(file: File): Promise<{ bytes: Uint8Array; type: 'png' | 'jpeg' }> {
  if (file.type === 'image/png')
    return { bytes: new Uint8Array(await file.arrayBuffer()), type: 'png' }
  if (file.type === 'image/jpeg')
    return { bytes: new Uint8Array(await file.arrayBuffer()), type: 'jpeg' }
  // WebP (and anything else the browser can decode) is re-encoded as PNG.
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('image')
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'png' }
}

export default function PdfSignAnnotate() {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [history, setHistory] = useState<History>(emptyHistory)
  const [dragged, setDragged] = useState<SignObject | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<EditorTool>('select')
  const [images, setImages] = useState<Record<string, StoredImage>>({})
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [fitScale, setFitScale] = useState(1)
  const [inkColor, setInkColor] = useState('#111111')
  const [inkThickness, setInkThickness] = useState(3)
  const [dateFormat, setDateFormat] = useState<DateFormat>('iso')
  const [padOpen, setPadOpen] = useState(false)
  const [lastSignature, setLastSignature] = useState<InkStroke[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const workerRef = useRef<WorkerHandle<SignWorkerApi> | null>(null)
  const fontRef = useRef<Uint8Array | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const gestureBase = useRef<SignObject[] | null>(null)
  const lastInk = useRef<{ id: string; at: number; page: number } | null>(null)
  const imagesRef = useRef(images)
  const pdfRef = useRef<LoadedPdf | null>(null)

  const fontReady = usePreviewFont()

  useEffect(() => {
    imagesRef.current = images
  }, [images])
  useEffect(() => {
    pdfRef.current = pdf
  }, [pdf])

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      for (const img of Object.values(imagesRef.current)) URL.revokeObjectURL(img.url)
      void pdfRef.current?.task.destroy()
    },
    [],
  )

  function getWorker() {
    workerRef.current ??= wrapWorker<SignWorkerApi>(
      new Worker(new URL('./sign.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current
  }

  const objects = history.present
  const page = pdf?.pages[pageIndex] ?? null
  const pageObjects = useMemo(() => {
    const list = objects.filter((o) => o.page === pageIndex)
    return dragged ? list.map((o) => (o.id === dragged.id ? dragged : o)) : list
  }, [objects, pageIndex, dragged])
  const selected = pageObjects.find((o) => o.id === selectedId) ?? null
  const markedPages = useMemo(() => new Set(objects.map((o) => o.page)), [objects])
  const imageUrls = useMemo(
    () => Object.fromEntries(Object.entries(images).map(([id, img]) => [id, img.url])),
    [images],
  )

  // Fit-to-width measurement of the page stage.
  useEffect(() => {
    const el = stageRef.current
    if (!el || !page) return
    const update = () => setFitScale(Math.max(el.clientWidth / page.vw, 0.05))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [page])

  const scale = zoom === 'fit' ? fitScale : zoom / 100

  // Id of the text object whose consecutive edits are being coalesced into
  // one history step; any other change ends the burst.
  const textEditId = useRef<string | null>(null)

  const apply = useCallback((next: SignObject[]) => {
    textEditId.current = null
    setHistory((h) => commit(h, next))
  }, [])

  function addObject(obj: SignObject) {
    apply([...objects, obj])
    setSelectedId(obj.id)
    setTool('select')
  }

  // ── File handling ───────────────────────────────────────────────────────
  async function loadFile(files: File[]) {
    const file = files[0]
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      const loaded = await openPdf(file)
      void pdf?.task.destroy()
      setPdf(loaded)
      setPageIndex(0)
      setHistory(emptyHistory())
      setSelectedId(null)
      setTool('select')
      setZoom('fit')
    } catch (err) {
      setError(pdfErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    void pdf?.task.destroy()
    for (const img of Object.values(images)) URL.revokeObjectURL(img.url)
    setImages({})
    setPdf(null)
    setHistory(emptyHistory())
    setSelectedId(null)
    setDragged(null)
    setError(null)
    setLastSignature(null)
  }

  async function addImageFile(file: File | undefined) {
    if (!file || !page) return
    if (file.size > MAX_IMAGE_BYTES) {
      toast('That image is larger than 20 MB. Pick a smaller one.', { variant: 'error' })
      return
    }
    try {
      const { bytes, type } = await toPngOrJpeg(file)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: `image/${type}` }))
      const probe = new Image()
      await new Promise<void>((resolve, reject) => {
        probe.onload = () => resolve()
        probe.onerror = () => reject(new Error('image'))
        probe.src = url
      })
      const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setImages((prev) => ({
        ...prev,
        [id]: { bytes, type, url, width: probe.width, height: probe.height },
      }))
      const width = page.vw * SIGNATURE_PAGE_SHARE
      const height = width * (probe.height / probe.width)
      addObject(
        clampToPage(
          createImage(pageIndex, (page.vw - width) / 2, (page.vh - height) / 2, id, width, height),
          page.vw,
          page.vh,
        ),
      )
    } catch {
      toast('Could not read that image. Use a PNG, JPEG or WebP file.', { variant: 'error' })
    }
  }

  // ── Placing and drawing ─────────────────────────────────────────────────
  function placeAt(x: number, y: number) {
    if (!page) return
    if (tool === 'text' || tool === 'date') {
      const text = tool === 'date' ? formatDate(new Date(), dateFormat) : 'Text'
      addObject(
        clampToPage(
          createText(pageIndex, x, y, {
            text,
            size: DEFAULT_TEXT_SIZE,
            color: inkColor,
            width: measureTextWidth(text, DEFAULT_TEXT_SIZE),
          }),
          page.vw,
          page.vh,
        ),
      )
    } else if (tool === 'check') {
      addObject(
        clampToPage(createCheck(pageIndex, x, y, DEFAULT_CHECK_SIZE, inkColor), page.vw, page.vh),
      )
    }
  }

  function handleInkStroke(stroke: InkStroke) {
    const now = Date.now()
    const last = lastInk.current
    const previous = last && objects.find((o) => o.id === last.id)
    if (
      last &&
      previous &&
      previous.kind === 'ink' &&
      last.page === pageIndex &&
      now - last.at < INK_MERGE_MS
    ) {
      apply(replaceObject(objects, appendInk(previous, [stroke])))
      lastInk.current = { id: previous.id, at: now, page: pageIndex }
      return
    }
    const ink = createInk(pageIndex, [stroke], inkThickness, inkColor)
    apply([...objects, ink])
    lastInk.current = { id: ink.id, at: now, page: pageIndex }
  }

  function placeSignature(strokes: InkStroke[], thickness: number) {
    setPadOpen(false)
    if (!page || strokes.length === 0) return
    setLastSignature(strokes)
    const bounds = strokeBounds(strokes, thickness)
    const width = Math.max(bounds.maxX - bounds.minX, 1)
    const factor = (page.vw * SIGNATURE_PAGE_SHARE) / width
    const scaled = scaleStrokes(strokes, factor)
    const sb = strokeBounds(scaled, thickness * factor)
    const centered = translateStrokes(
      scaled,
      (page.vw - (sb.maxX - sb.minX)) / 2 - sb.minX,
      (page.vh - (sb.maxY - sb.minY)) / 2 - sb.minY,
    )
    addObject(
      clampToPage(createInk(pageIndex, centered, thickness * factor, inkColor), page.vw, page.vh),
    )
  }

  // ── Selection editing ───────────────────────────────────────────────────
  function updateSelected(next: SignObject) {
    apply(replaceObject(objects, next))
  }

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    textEditId.current = null
    setHistory((h) => commit(h, removeObject(h.present, selectedId)))
    setSelectedId(null)
  }, [selectedId])

  function handleDrag(next: SignObject) {
    gestureBase.current ??= objects
    setDragged(next)
  }

  function handleDragEnd() {
    const base = gestureBase.current
    const next = dragged
    gestureBase.current = null
    setDragged(null)
    if (base && next) {
      textEditId.current = null
      setHistory((h) => ({ ...commit({ ...h, present: base }, replaceObject(base, next)) }))
    }
  }

  function handleTextEdit(obj: TextObject, text: string) {
    if (text === obj.text) return
    const next = { ...obj, text, width: measureTextWidth(text, obj.size) }
    if (textEditId.current === obj.id) {
      // Same burst of typing: overwrite the step recorded when it started so
      // the history holds one entry per edit session, not one per keystroke.
      setHistory((h) => amend(h, replaceObject(h.present, next)))
      return
    }
    apply(replaceObject(objects, next))
    textEditId.current = obj.id
  }

  // ── Keyboard ────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) === true
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        textEditId.current = null
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)))
        setSelectedId(null)
        return
      }
      if (typing) return
      if (e.key === 'Escape') setSelectedId(null)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedId) return
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, deleteSelected])

  // ── Export ──────────────────────────────────────────────────────────────
  async function exportPdf() {
    if (!pdf || exporting) return
    setExporting(true)
    setError(null)
    try {
      const plan = exportPlan(objects, pdf.pages)
      let fontBytes: Uint8Array | null = null
      if (plan.some((c) => c.type === 'text')) {
        if (!fontRef.current) {
          const res = await fetch(FONT_URL)
          if (!res.ok) throw new Error('font')
          fontRef.current = new Uint8Array(await res.arrayBuffer())
        }
        fontBytes = fontRef.current
      }
      const assets: ImageAsset[] = Object.entries(images).map(([id, img]) => ({
        id,
        bytes: img.bytes,
        type: img.type,
      }))
      const out = await getWorker().api.sign({
        bytes: pdf.bytes.slice(),
        plan,
        images: assets,
        fontBytes,
      })
      const base = pdf.name.replace(/\.pdf$/i, '')
      downloadBlob(new Blob([out as BlobPart], { type: 'application/pdf' }), `${base}.signed.pdf`)
      toast('Signed PDF downloaded.', { variant: 'success' })
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'font'
          ? 'Could not load the bundled font needed for text.'
          : 'Could not write the signed PDF. This file may use features pdf-lib cannot modify.'
      setError(message)
      toast(message, { variant: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const tools: [EditorTool | 'signature', string, typeof Type][] = [
    ['select', 'Select', MousePointer2],
    ['text', 'Text', Type],
    ['image', 'Image', ImageIcon],
    ['draw', 'Draw', PenLine],
    ['signature', 'Signature', PenTool],
    ['check', 'Checkmark', CheckIcon],
    ['date', 'Date', CalendarDays],
  ]

  return (
    <ToolLayout
      title="PDF sign & annotate"
      description="Place a signature, text, dates and checkmarks on a PDF — flattened into a copy, in your browser"
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
            <>
              <FileDropzone
                accept="application/pdf,.pdf"
                onFiles={(files) => void loadFile(files)}
                onReject={() => setError(null)}
                hint="One PDF"
              />
              <p className="mt-3 text-xs text-muted">
                The file stays in your browser; you download a flattened copy. The original is never
                changed.
              </p>
            </>
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

          {/* ── Toolbar ───────────────────────────────────────────────── */}
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card p-2">
            <div role="toolbar" aria-label="Tools" className="flex flex-wrap gap-1">
              {tools.map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={tool === key}
                  title={label}
                  onClick={() => {
                    if (key === 'signature') {
                      setPadOpen(true)
                      return
                    }
                    if (key === 'image') {
                      imageInputRef.current?.click()
                      return
                    }
                    setTool(key)
                    setSelectedId(null)
                  }}
                  className={cx(
                    'flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
                    tool === key
                      ? 'border-pine bg-mint text-pine'
                      : 'border-line-strong bg-card text-muted hover:text-ink',
                  )}
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  textEditId.current = null
                  setHistory(undo)
                  setSelectedId(null)
                }}
                disabled={!canUndo(history)}
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  textEditId.current = null
                  setHistory(redo)
                  setSelectedId(null)
                }}
                disabled={!canRedo(history)}
                aria-label="Redo"
                title="Redo (Ctrl+Shift+Z)"
              >
                <Redo2 className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={deleteSelected}
                disabled={!selected}
                aria-label="Delete selected object"
                title="Delete (Del)"
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Button size="sm" onClick={() => void exportPdf()} disabled={exporting}>
                {exporting ? (
                  'Preparing…'
                ) : (
                  <>
                    <Download className="size-3.5" />
                    Download signed PDF
                  </>
                )}
              </Button>
            </div>
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void addImageFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />

          {error && (
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-4 lg:flex-row">
            {pdf.pages.length > 1 && (
              <Thumbnails
                doc={pdf.doc}
                pages={pdf.pages}
                pageIndex={pageIndex}
                markedPages={markedPages}
                onSelect={(i) => {
                  setPageIndex(i)
                  setSelectedId(null)
                }}
              />
            )}

            <div className="min-w-0 flex-1">
              {/* Page navigator + zoom */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPageIndex((i) => Math.max(0, i - 1))
                    setSelectedId(null)
                  }}
                  disabled={pageIndex === 0}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input
                    type="number"
                    min={1}
                    max={pdf.pageCount}
                    value={pageIndex + 1}
                    aria-label="Page number"
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      if (Number.isFinite(n) && n >= 1 && n <= pdf.pageCount) {
                        setPageIndex(n - 1)
                        setSelectedId(null)
                      }
                    }}
                    className="h-8 w-16 rounded-md border border-line-strong bg-card px-2 text-center font-mono text-xs text-ink focus:border-pine focus:outline-none"
                  />
                  of {pdf.pageCount}
                </label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPageIndex((i) => Math.min(pdf.pageCount - 1, i + 1))
                    setSelectedId(null)
                  }}
                  disabled={pageIndex === pdf.pageCount - 1}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-3.5" />
                </Button>

                <div className="ml-auto flex items-center gap-1.5">
                  <input
                    type="range"
                    min={50}
                    max={200}
                    step={10}
                    value={zoom === 'fit' ? Math.round(fitScale * 100) : zoom}
                    aria-label="Zoom"
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-24 accent-(--color-pine)"
                  />
                  <span className="w-10 font-mono text-[11px] text-muted tabular-nums">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setZoom('fit')}>
                    Fit
                  </Button>
                </div>
              </div>

              <div className="overflow-auto rounded-lg border border-line bg-shade p-2">
                <div ref={stageRef}>
                  {page && fontReady && (
                    <Editor
                      doc={pdf.doc}
                      pageIndex={pageIndex}
                      page={page}
                      scale={scale}
                      objects={pageObjects}
                      imageUrls={imageUrls}
                      selectedId={selectedId}
                      tool={tool}
                      inkColor={inkColor}
                      inkThickness={inkThickness}
                      onSelect={setSelectedId}
                      onDrag={handleDrag}
                      onDragEnd={handleDragEnd}
                      onPlaceAt={placeAt}
                      onInkStroke={handleInkStroke}
                      onTextEdit={handleTextEdit}
                    />
                  )}
                </div>
              </div>

              <p className="mt-2 text-xs text-muted">
                Objects are flattened into the page and can&rsquo;t be edited in other PDF viewers.
                Nothing is uploaded.
              </p>
            </div>

            {/* ── Properties ────────────────────────────────────────────── */}
            <aside className="w-full shrink-0 rounded-lg border border-line bg-card p-3 lg:w-64">
              <h2 className="mb-2 text-xs font-semibold text-ink">
                {selected ? 'Selected object' : 'Tool settings'}
              </h2>

              {selected?.kind === 'text' && (
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted">Text</span>
                    <textarea
                      value={selected.text}
                      rows={2}
                      onChange={(e) => handleTextEdit(selected, e.target.value)}
                      className="rounded-md border border-line-strong bg-card p-2 text-sm text-ink focus:border-pine focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="flex justify-between text-xs font-medium text-muted">
                      Font size
                      <span className="font-mono tabular-nums">{Math.round(selected.size)} pt</span>
                    </span>
                    <input
                      type="range"
                      min={6}
                      max={72}
                      value={Math.round(selected.size)}
                      onChange={(e) => {
                        const size = Number(e.target.value)
                        updateSelected({
                          ...selected,
                          size,
                          width: measureTextWidth(selected.text, size),
                        })
                      }}
                      className="accent-(--color-pine)"
                    />
                  </label>
                  <ColorField
                    value={selected.color}
                    onChange={(color) => updateSelected({ ...selected, color })}
                  />
                </div>
              )}

              {selected?.kind === 'ink' && (
                <div className="flex flex-col gap-3">
                  <ColorField
                    value={selected.color}
                    onChange={(color) => updateSelected({ ...selected, color })}
                  />
                  <label className="flex flex-col gap-1">
                    <span className="flex justify-between text-xs font-medium text-muted">
                      Thickness
                      <span className="font-mono tabular-nums">
                        {selected.thickness.toFixed(1)} pt
                      </span>
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      step={0.5}
                      value={Math.min(12, Math.max(1, selected.thickness))}
                      onChange={(e) =>
                        updateSelected({ ...selected, thickness: Number(e.target.value) })
                      }
                      className="accent-(--color-pine)"
                    />
                  </label>
                </div>
              )}

              {selected?.kind === 'check' && (
                <div className="flex flex-col gap-3">
                  <ColorField
                    value={selected.color}
                    onChange={(color) => updateSelected({ ...selected, color })}
                  />
                  <label className="flex flex-col gap-1">
                    <span className="flex justify-between text-xs font-medium text-muted">
                      Size
                      <span className="font-mono tabular-nums">{Math.round(selected.size)} pt</span>
                    </span>
                    <input
                      type="range"
                      min={10}
                      max={120}
                      value={Math.round(selected.size)}
                      onChange={(e) =>
                        updateSelected({ ...selected, size: Number(e.target.value) })
                      }
                      className="accent-(--color-pine)"
                    />
                  </label>
                </div>
              )}

              {selected?.kind === 'image' && (
                <p className="text-xs text-muted">
                  Drag to move, or drag a corner to resize. The aspect ratio is kept.
                </p>
              )}

              {!selected && (
                <div className="flex flex-col gap-3">
                  <ColorField value={inkColor} onChange={setInkColor} label="Ink / text color" />
                  <label className="flex flex-col gap-1">
                    <span className="flex justify-between text-xs font-medium text-muted">
                      Pen thickness
                      <span className="font-mono tabular-nums">{inkThickness} pt</span>
                    </span>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      value={inkThickness}
                      onChange={(e) => setInkThickness(Number(e.target.value))}
                      className="accent-(--color-pine)"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted">Date format</span>
                    <select
                      value={dateFormat}
                      onChange={(e) => setDateFormat(e.target.value as DateFormat)}
                      className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
                    >
                      {DATE_FORMATS.map((f) => (
                        <option key={f} value={f}>
                          {formatDate(new Date(), f)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-[11px] text-muted">
                    Click the page with a tool selected to place it. Double-click a text object to
                    edit it.
                  </p>
                </div>
              )}
            </aside>
          </div>
        </>
      )}

      {padOpen && (
        <SignaturePad
          initialStrokes={lastSignature ?? undefined}
          initialThickness={inkThickness}
          onCancel={() => setPadOpen(false)}
          onPlace={placeSignature}
        />
      )}
    </ToolLayout>
  )
}

function ColorField({
  value,
  onChange,
  label = 'Color',
}: {
  value: string
  onChange: (color: string) => void
  label?: string
}) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-7 w-12 cursor-pointer rounded border border-line-strong bg-card"
      />
    </label>
  )
}
