import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Download, FolderArchive, ImagePlus, Trash2, X } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { toast } from '../../lib/toast'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob, downloadZip, type ZipEntry } from '../../lib/download'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import {
  computeTarget,
  dedupeNames,
  outputFileName,
  type OutputFormat,
  type ResizeMode,
  type ResizeSettings,
} from './resizeMath'
import type { ResizeWorkerApi } from './resize.worker'

interface ResultInfo {
  blob: Blob
  url: string
  name: string
  width: number
  height: number
}

interface ImageItem {
  id: number
  file: File
  url: string
  width: number
  height: number
  status: 'ready' | 'working' | 'done' | 'error'
  result?: ResultInfo
  warning?: string
  error?: string
}

const modes: { id: ResizeMode; label: string }[] = [
  { id: 'pixels', label: 'Pixels' },
  { id: 'percent', label: 'Percent' },
  { id: 'preset', label: 'Preset' },
  { id: 'filesize', label: 'Target size' },
]

const sizeUnits = { KB: 1024, MB: 1024 * 1024 } as const
type SizeUnit = keyof typeof sizeUnits

const formats: { id: OutputFormat; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: 'png', label: 'PNG' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'webp', label: 'WebP' },
]

const presets = [2048, 1920, 1600, 1280, 1024, 800, 512, 256]

const formatMimes: Record<Exclude<OutputFormat, 'original'>, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

const numberInputClasses =
  'h-8 w-24 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none'

let nextId = 1

export default function ImageResize() {
  const [items, setItems] = useState<ImageItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mode, setMode] = useState<ResizeMode>('pixels')
  const [widthText, setWidthText] = useState('')
  const [heightText, setHeightText] = useState('')
  const [lockAspect, setLockAspect] = useState(true)
  const [percent, setPercent] = useState(50)
  const [presetEdge, setPresetEdge] = useState(1280)
  const [targetText, setTargetText] = useState('500')
  const [targetUnit, setTargetUnit] = useState<SizeUnit>('KB')
  const [format, setFormat] = useState<OutputFormat>('original')
  const [quality, setQuality] = useState(85)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const workerRef = useRef<WorkerHandle<ResizeWorkerApi> | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const busy = progress !== null

  function getWorker() {
    workerRef.current ??= wrapWorker<ResizeWorkerApi>(
      new Worker(new URL('./resize.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current
  }

  useEffect(
    () => () => {
      workerRef.current?.terminate()
    },
    [],
  )
  // Object URLs are revoked when items are removed; on unmount the page goes away with them.

  const settings: ResizeSettings = useMemo(() => {
    const parse = (t: string) => {
      const n = Number.parseInt(t, 10)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    return {
      mode,
      width: parse(widthText),
      height: parse(heightText),
      lockAspect,
      percent,
      presetEdge,
    }
  }, [mode, widthText, heightText, lockAspect, percent, presetEdge])

  const targetNumber = Number.parseFloat(targetText)
  const targetBytes =
    Number.isFinite(targetNumber) && targetNumber > 0
      ? Math.round(targetNumber * sizeUnits[targetUnit])
      : null
  const pixelsMissing = mode === 'pixels' && settings.width == null && settings.height == null
  const targetMissing = mode === 'filesize' && targetBytes == null
  const canResize = items.length > 0 && !busy && !pixelsMissing && !targetMissing
  const results = items.filter((i) => i.status === 'done' && i.result)
  const showQuality = (format === 'jpeg' || format === 'webp') && mode !== 'filesize'
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null

  async function addFiles(files: File[]) {
    const added: ImageItem[] = []
    for (const file of files) {
      try {
        const dims = await getWorker().api.dimensions(file)
        added.push({
          id: nextId++,
          file,
          url: URL.createObjectURL(file),
          width: dims.width,
          height: dims.height,
          status: 'ready',
        })
      } catch {
        toast(`Could not read ${file.name} — is it a valid image?`, { variant: 'error' })
      }
    }
    if (added.length > 0) setItems((prev) => [...prev, ...added])
  }

  function releaseItem(item: ImageItem) {
    URL.revokeObjectURL(item.url)
    if (item.result) URL.revokeObjectURL(item.result.url)
  }

  function removeItem(id: number) {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id)
      if (item) releaseItem(item)
      return prev.filter((i) => i.id !== id)
    })
  }

  function clearAll() {
    setItems((prev) => {
      prev.forEach(releaseItem)
      return []
    })
  }

  async function resizeAll() {
    if (!canResize) return
    setProgress({ done: 0, total: items.length })
    const snapshot = settings
    const worker = getWorker()
    let failures = 0

    for (const item of items) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: 'working', error: undefined, warning: undefined } : i,
        ),
      )
      try {
        let out
        let warning: string | undefined
        if (snapshot.mode === 'filesize') {
          const lossy = format === 'webp' ? 'image/webp' : 'image/jpeg'
          const targeted = await worker.api.resizeToTargetSize(item.file, {
            targetBytes: targetBytes!,
            mime: lossy,
          })
          out = targeted
          if (!targeted.achieved) {
            warning = `Couldn't reach ${formatBytes(targetBytes!)} — smallest possible shown`
          }
        } else {
          const target = computeTarget({ width: item.width, height: item.height }, snapshot)
          const mime = format === 'original' ? item.file.type || 'image/png' : formatMimes[format]
          out = await worker.api.resize(item.file, {
            width: target.width,
            height: target.height,
            mime,
            quality: quality / 100,
          })
        }
        const blob = new Blob([out.buffer], { type: out.mime })
        const result: ResultInfo = {
          blob,
          url: URL.createObjectURL(blob),
          name: outputFileName(item.file.name, out.mime, out),
          width: out.width,
          height: out.height,
        }
        setItems((prev) =>
          prev.map((i) => {
            if (i.id !== item.id) return i
            if (i.result) URL.revokeObjectURL(i.result.url)
            return { ...i, status: 'done', result, warning }
          }),
        )
      } catch (err) {
        failures++
        const message = err instanceof Error && err.message ? err.message : 'Resize failed'
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: message } : i)),
        )
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
    }

    setProgress(null)
    if (failures > 0) {
      toast(`${failures} ${failures === 1 ? 'image' : 'images'} could not be resized.`, {
        variant: 'error',
      })
    }
  }

  async function downloadAll() {
    if (results.length === 0) return
    const names = dedupeNames(results.map((i) => i.result!.name))
    const entries: ZipEntry[] = []
    for (const [idx, item] of results.entries()) {
      entries.push({
        name: names[idx]!,
        data: new Uint8Array(await item.result!.blob.arrayBuffer()),
      })
    }
    await downloadZip(entries, 'resized-images.zip')
  }

  return (
    <ToolLayout
      title="Image resize"
      description="Resize images by pixels, percentage or preset — single or in batch, with format conversion. Everything runs in your browser."
      badge="client-side"
    >
      {/* Settings */}
      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-line bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <fieldset className="flex items-center gap-3">
            <legend className="sr-only">Resize mode</legend>
            <span className="text-xs font-medium text-muted">Resize by</span>
            <div className="flex overflow-hidden rounded-md border border-line-strong">
              {modes.map((m) => (
                <label
                  key={m.id}
                  className={cx(
                    'cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors not-first:border-l not-first:border-line',
                    mode === m.id ? 'bg-pine text-page' : 'bg-card text-muted hover:bg-mint',
                  )}
                >
                  <input
                    type="radio"
                    name="resize-mode"
                    value={m.id}
                    checked={mode === m.id}
                    onChange={() => {
                      setMode(m.id)
                      // Size targeting needs a lossy encoder.
                      if (m.id === 'filesize' && format !== 'jpeg' && format !== 'webp') {
                        setFormat('jpeg')
                      }
                    }}
                    className="sr-only"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>

          {mode === 'pixels' && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <label className="flex items-center gap-2 text-xs font-medium text-muted">
                Width
                <input
                  type="number"
                  min={1}
                  value={widthText}
                  onChange={(e) => setWidthText(e.target.value)}
                  placeholder="auto"
                  aria-label="Target width in pixels"
                  className={numberInputClasses}
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-muted">
                Height
                <input
                  type="number"
                  min={1}
                  value={heightText}
                  onChange={(e) => setHeightText(e.target.value)}
                  placeholder="auto"
                  aria-label="Target height in pixels"
                  className={numberInputClasses}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted">
                <input
                  type="checkbox"
                  checked={lockAspect}
                  onChange={(e) => setLockAspect(e.target.checked)}
                  className="size-3.5 accent-(--color-pine)"
                />
                Lock aspect ratio
              </label>
            </div>
          )}

          {mode === 'percent' && (
            <label className="flex items-center gap-2 text-xs font-medium text-muted">
              Scale
              <input
                type="number"
                min={1}
                max={1000}
                value={percent}
                onChange={(e) =>
                  setPercent(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))
                }
                aria-label="Scale percentage"
                className={numberInputClasses}
              />
              %
            </label>
          )}

          {mode === 'preset' && (
            <label className="flex items-center gap-2 text-xs font-medium text-muted">
              Longest edge
              <select
                value={presetEdge}
                onChange={(e) => setPresetEdge(Number(e.target.value))}
                aria-label="Preset size"
                className="h-8 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
              >
                {presets.map((p) => (
                  <option key={p} value={p}>
                    {p} px
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'filesize' && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <label className="flex items-center gap-2 text-xs font-medium text-muted">
                Max size
                <input
                  type="number"
                  min={1}
                  value={targetText}
                  onChange={(e) => setTargetText(e.target.value)}
                  aria-label="Target file size"
                  className={numberInputClasses}
                />
              </label>
              <select
                value={targetUnit}
                onChange={(e) => setTargetUnit(e.target.value as SizeUnit)}
                aria-label="Target size unit"
                className="h-8 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
              >
                {Object.keys(sizeUnits).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <p className="text-xs text-faint">
                Keeps resolution when possible; lowers quality first, shrinks only if needed.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <fieldset className="flex items-center gap-3">
            <legend className="sr-only">Output format</legend>
            <span className="text-xs font-medium text-muted">Format</span>
            <div className="flex overflow-hidden rounded-md border border-line-strong">
              {formats.map((f) => {
                const lossless = f.id === 'original' || f.id === 'png'
                const unavailable = mode === 'filesize' && lossless
                return (
                  <label
                    key={f.id}
                    title={
                      unavailable ? 'Target size needs a lossy format (JPEG or WebP)' : undefined
                    }
                    className={cx(
                      'px-3 py-1.5 text-xs font-medium transition-colors not-first:border-l not-first:border-line',
                      format === f.id ? 'bg-pine text-page' : 'bg-card text-muted',
                      unavailable
                        ? 'cursor-not-allowed opacity-40'
                        : 'cursor-pointer hover:bg-mint',
                    )}
                  >
                    <input
                      type="radio"
                      name="output-format"
                      value={f.id}
                      checked={format === f.id}
                      disabled={unavailable}
                      onChange={() => setFormat(f.id)}
                      className="sr-only"
                    />
                    {f.label}
                  </label>
                )
              })}
            </div>
          </fieldset>

          {showQuality && (
            <label className="flex items-center gap-2 text-xs font-medium text-muted">
              Quality
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                aria-label="Output quality"
                className="w-32 accent-(--color-pine)"
              />
              <span className="w-7 font-mono tabular-nums">{quality}</span>
            </label>
          )}

          {mode === 'pixels' && lockAspect && settings.width != null && settings.height != null && (
            <p className="text-xs text-faint">Images are fitted within the box, never distorted.</p>
          )}
        </div>
      </div>

      {/* Input */}
      {items.length === 0 ? (
        <FileDropzone
          accept="image/*"
          multiple
          onFiles={addFiles}
          hint="PNG, JPEG, WebP — drop several for batch mode"
        />
      ) : (
        <>
          {selected && (
            <figure className="mb-4">
              <div className="flex items-center justify-center rounded-lg border border-line bg-page p-2">
                <img
                  src={selected.result?.url ?? selected.url}
                  alt={`Preview of ${selected.file.name}`}
                  className="max-h-[70vh] max-w-full rounded-md object-contain"
                />
              </div>
              <figcaption className="mt-1.5 text-center font-mono text-[11px] text-muted tabular-nums">
                {selected.file.name} ·{' '}
                {selected.result
                  ? `${selected.result.width}×${selected.result.height} (resized)`
                  : `${selected.width}×${selected.height}`}
              </figcaption>
            </figure>
          )}

          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={cx(
                  'flex items-center gap-3 rounded-lg border bg-card px-3 py-2',
                  selected?.id === item.id ? 'border-pine' : 'border-line',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  aria-label={`Preview ${item.file.name}`}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                >
                  <img
                    src={item.result?.url ?? item.url}
                    alt=""
                    className="size-12 shrink-0 rounded-md border border-line object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {item.file.name}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-1.5 font-mono text-[11px] text-muted tabular-nums">
                      <span>
                        {item.width}×{item.height} · {formatBytes(item.file.size)}
                      </span>
                      {item.status === 'done' && item.result && (
                        <>
                          <ArrowRight aria-hidden className="size-3 text-faint" />
                          <span className="text-pine">
                            {item.result.width}×{item.result.height} ·{' '}
                            {formatBytes(item.result.blob.size)}
                          </span>
                        </>
                      )}
                      {item.status === 'working' && <span className="text-faint">resizing…</span>}
                      {item.status === 'done' && item.warning && (
                        <span className="text-amber-badge">{item.warning}</span>
                      )}
                      {item.status === 'error' && (
                        <span className="text-red-600 dark:text-red-400">{item.error}</span>
                      )}
                    </span>
                  </span>
                </button>
                {item.status === 'done' && item.result && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => downloadBlob(item.result!.blob, item.result!.name)}
                    aria-label={`Download ${item.result.name}`}
                  >
                    <Download className="size-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(item.id)}
                  disabled={busy}
                  aria-label={`Remove ${item.file.name}`}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addInputRef.current?.click()}
              disabled={busy}
            >
              <ImagePlus className="size-3.5" />
              Add more
            </Button>
            <input
              ref={addInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files) void addFiles(Array.from(e.target.files))
                e.target.value = ''
              }}
            />
            <Button variant="ghost" size="sm" onClick={clearAll} disabled={busy}>
              <Trash2 className="size-3.5" />
              Clear all
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button onClick={resizeAll} disabled={!canResize}>
              {busy
                ? `Resizing ${progress.done + 1}/${progress.total}…`
                : `Resize ${items.length} ${items.length === 1 ? 'image' : 'images'}`}
            </Button>
            {results.length > 1 && (
              <Button variant="secondary" onClick={downloadAll} disabled={busy}>
                <FolderArchive className="size-4" />
                Download all (.zip)
              </Button>
            )}
            {pixelsMissing && items.length > 0 && (
              <p className="text-xs text-muted">Enter a width and/or height to resize.</p>
            )}
            {targetMissing && items.length > 0 && (
              <p className="text-xs text-muted">Enter a target file size.</p>
            )}
          </div>

          {busy && (
            <ProgressBar
              className="mt-4 max-w-md"
              value={(progress.done / progress.total) * 100}
              label="Processing images"
            />
          )}
        </>
      )}
    </ToolLayout>
  )
}
