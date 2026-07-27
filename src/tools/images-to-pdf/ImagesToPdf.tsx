import { useEffect, useRef, useState } from 'react'
import { proxy } from 'comlink'
import { ArrowDown, ArrowUp, FileDown, GripVertical, ImagePlus, Trash2, X } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { moveItem } from '../../lib/reorder'
import type { PageMode } from './pageLayout'
import type { BuildWorkerApi } from './build.worker'

interface ImageItem {
  id: number
  file: File
  name: string
  size: number
  /** Object URL backing the thumbnail; revoked when the item is removed. */
  url: string
  /** Displayed (EXIF-oriented) dimensions in pixels. */
  width: number
  height: number
}

let nextId = 1

async function openImage(file: File): Promise<ImageItem> {
  const head = new Uint8Array(await file.slice(0, 3).arrayBuffer())
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e
  const isJpeg = head[0] === 0xff && head[1] === 0xd8
  if (!isPng && !isJpeg) throw new Error('unsupported format')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const { width, height } = bitmap
  bitmap.close()
  return {
    id: nextId++,
    file,
    name: file.name,
    size: file.size,
    url: URL.createObjectURL(file),
    width,
    height,
  }
}

const PAGE_MODES: { value: PageMode; label: string; hint: string }[] = [
  { value: 'fit', label: 'Fit image', hint: 'Each page matches its image exactly.' },
  { value: 'a4', label: 'A4', hint: 'Image centered on A4 with ½″ margins.' },
  { value: 'letter', label: 'Letter', hint: 'Image centered on Letter with ½″ margins.' },
]

export default function ImagesToPdf() {
  const [items, setItems] = useState<ImageItem[]>([])
  const [reading, setReading] = useState<null | { done: number; total: number }>(null)
  const [error, setError] = useState<string | null>(null)
  const [building, setBuilding] = useState<null | { done: number; total: number }>(null)
  const [pageMode, setPageMode] = useState<PageMode>('fit')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const addInputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<WorkerHandle<BuildWorkerApi> | null>(null)
  // Mirrors `items` so the unmount cleanup below can revoke every URL.
  const itemsRef = useRef<ImageItem[]>([])
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      for (const item of itemsRef.current) URL.revokeObjectURL(item.url)
    },
    [],
  )

  async function addFiles(files: File[]) {
    setError(null)
    setReading({ done: 0, total: files.length })
    const failed: string[] = []
    const opened: ImageItem[] = []
    let done = 0
    for (const file of files) {
      try {
        opened.push(await openImage(file))
      } catch {
        failed.push(`${file.name} could not be read. PNG and JPEG images only.`)
      }
      setReading({ done: ++done, total: files.length })
    }
    setItems((prev) => [...prev, ...opened])
    if (failed.length > 0) setError(failed.join(' '))
    setReading(null)
  }

  function removeItem(index: number) {
    setItems((prev) => {
      const item = prev[index]
      if (item) URL.revokeObjectURL(item.url)
      return prev.filter((_, i) => i !== index)
    })
  }

  function clearAll() {
    for (const item of items) URL.revokeObjectURL(item.url)
    setItems([])
    setError(null)
  }

  function move(from: number, to: number) {
    setItems((prev) => moveItem(prev, from, to))
  }

  async function buildPdf() {
    if (items.length === 0 || building) return
    setError(null)
    setBuilding({ done: 0, total: items.length })
    try {
      workerRef.current ??= wrapWorker<BuildWorkerApi>(
        new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' }),
      )
      const onProgress = proxy((done: number, total: number) => setBuilding({ done, total }))
      const data = await workerRef.current.api.build(
        items.map((i) => i.file),
        pageMode,
        onProgress,
      )
      downloadBlob(new Blob([data as BlobPart], { type: 'application/pdf' }), 'images.pdf')
    } catch {
      setError('Creating the PDF failed. One of these images may be corrupted.')
    } finally {
      setBuilding(null)
    }
  }

  const totalBytes = items.reduce((n, i) => n + i.size, 0)
  const activeMode = PAGE_MODES.find((m) => m.value === pageMode) ?? PAGE_MODES[0]

  return (
    <ToolLayout
      title="Images → PDF"
      description="Turn photos and screenshots into a single PDF, one image per page. Drag the images into the order you want. Everything stays in your browser."
      badge="client-side"
    >
      {items.length === 0 ? (
        <>
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {reading ? (
            <ProgressBar value={(reading.done / reading.total) * 100} label="Reading images" />
          ) : (
            <FileDropzone
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              multiple
              onFiles={(files) => void addFiles(files)}
              hint="PNG or JPEG. You can reorder them before creating the PDF"
            />
          )}
        </>
      ) : (
        <>
          <ol className="flex flex-col gap-2" aria-label="Images in page order">
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
                <img
                  src={item.url}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  style={{ aspectRatio: `${item.width} / ${item.height}` }}
                  className="w-16 shrink-0 rounded-sm bg-white object-contain shadow-sm sm:w-20"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                  <p className="font-mono text-[11px] text-muted tabular-nums">
                    <span className="hidden sm:inline">
                      {item.width} × {item.height} px ·{' '}
                    </span>
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
              <ImagePlus className="size-3.5" />
              Add more
            </Button>
            <input
              ref={addInputRef}
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
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
            {reading && (
              <ProgressBar
                className="min-w-32 flex-1"
                value={(reading.done / reading.total) * 100}
                label="Reading images"
              />
            )}
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-4">
            <span className="text-xs font-medium text-muted">Page size</span>
            <div
              role="radiogroup"
              aria-label="Page size"
              className="flex gap-1 rounded-md border border-line bg-card p-1"
            >
              {PAGE_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={pageMode === m.value}
                  onClick={() => setPageMode(m.value)}
                  className={cx(
                    'cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    pageMode === m.value ? 'bg-mint text-pine' : 'text-muted hover:text-ink',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">{activeMode.hint}</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => void buildPdf()} disabled={!!building}>
              <FileDown className="size-4" />
              Create PDF · {items.length} {items.length === 1 ? 'page' : 'pages'}
            </Button>
            <p className="font-mono text-[11px] text-muted tabular-nums" role="status">
              {formatBytes(totalBytes)} total
            </p>
            {building && (
              <ProgressBar
                className="min-w-40 flex-1"
                value={(building.done / building.total) * 100}
                label="Creating PDF"
              />
            )}
          </div>
        </>
      )}
    </ToolLayout>
  )
}
