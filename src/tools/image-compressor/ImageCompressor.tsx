import { useEffect, useRef, useState } from 'react'
import { Download, FileArchive, OctagonX, Play, Square, Trash2 } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob, downloadZip } from '../../lib/download'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import {
  defaultSettings,
  downscaleFactor,
  effectiveLevel,
  effectiveQuality,
  FLATTEN_LABELS,
  FORMAT_LABELS,
  FORMAT_ORDER,
  MAX_DIMENSION_LABELS,
  MAX_DIMENSION_OPTIONS,
  outputName,
  resolveFormat,
  savingsPercent,
  type CompressFormat,
  type CompressSettings,
  type FlattenColor,
} from './compress'
import type { CompressWorkerApi } from './compress.worker'

type ItemStatus = 'ready' | 'working' | 'done' | 'error'

interface Item {
  id: number
  file: File
  /** Stable object URL for the original (comparison view, thumbnails). */
  url: string
  thumbUrl: string
  width: number
  height: number
  status: ItemStatus
  output: {
    blob: Blob
    url: string
    name: string
    width: number
    height: number
    format: string
    settings: CompressSettings
  } | null
  error: string | null
}

let nextId = 1

function settingsMatch(a: CompressSettings, b: CompressSettings): boolean {
  return (
    a.format === b.format &&
    a.quality === b.quality &&
    a.pngLevel === b.pngLevel &&
    a.maxDimension === b.maxDimension &&
    a.flatten === b.flatten
  )
}

function needsCompress(item: Item, settings: CompressSettings): boolean {
  if (item.status === 'ready' || item.status === 'error') return true
  if (item.status === 'done' && item.output) {
    return !settingsMatch(item.output.settings, settings)
  }
  return false
}

async function inspectImage(
  file: File,
): Promise<{ thumbUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, 96 / Math.max(bitmap.width, bitmap.height))
    const thumb = document.createElement('canvas')
    thumb.width = Math.max(1, Math.round(bitmap.width * scale))
    thumb.height = Math.max(1, Math.round(bitmap.height * scale))
    thumb.getContext('2d')?.drawImage(bitmap, 0, 0, thumb.width, thumb.height)
    return { thumbUrl: thumb.toDataURL(), width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

function ComparisonSlider({
  beforeUrl,
  afterUrl,
  beforeLabel,
  afterLabel,
}: {
  beforeUrl: string
  afterUrl: string
  beforeLabel: string
  afterLabel: string
}) {
  const [position, setPosition] = useState(50)
  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border border-line select-none">
        <img
          src={beforeUrl}
          alt="Original"
          className="block max-h-[60vh] w-full object-contain bg-page"
          draggable={false}
        />
        <img
          src={afterUrl}
          alt="Compressed"
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain bg-page"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        />
        <div
          aria-hidden
          className="absolute inset-y-0 w-0.5 bg-page shadow-[0_0_0_1px_var(--color-line-strong)]"
          style={{ left: `${position}%` }}
        />
        <span className="absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
          {beforeLabel}
        </span>
        <span className="absolute top-2 right-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
          {afterLabel}
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          aria-label="Reveal original versus compressed"
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <p className="mt-1.5 text-xs text-faint">
        Drag across the image to compare original and compressed.
      </p>
    </div>
  )
}

export default function ImageCompressor() {
  const [settings, setSettings] = useState<CompressSettings>(defaultSettings)
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [compareId, setCompareId] = useState<number | null>(null)
  // Bumped on Clear so the dropzone remounts with an empty input: otherwise
  // re-picking the same file fires no change event and silently does nothing.
  const [session, setSession] = useState(0)
  const workerRef = useRef<WorkerHandle<CompressWorkerApi> | null>(null)
  const stopRef = useRef(false)

  useEffect(() => () => workerRef.current?.terminate(), [])

  function worker(): WorkerHandle<CompressWorkerApi> {
    workerRef.current ??= wrapWorker<CompressWorkerApi>(
      new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current
  }

  async function addFiles(files: File[]) {
    if (files.length === 0 || busy) return
    setGlobalError(null)
    for (const file of files) {
      const id = nextId++
      const url = URL.createObjectURL(file)
      try {
        const info = await inspectImage(file)
        setItems((prev) => [
          ...prev,
          { id, file, url, ...info, status: 'ready', output: null, error: null },
        ])
      } catch {
        setItems((prev) => [
          ...prev,
          {
            id,
            file,
            url,
            thumbUrl: '',
            width: 0,
            height: 0,
            status: 'error' as const,
            output: null,
            error: 'Could not decode this image. It may be corrupted or an unsupported type.',
          },
        ])
      }
    }
  }

  function removeItem(id: number) {
    setItems((prev) => {
      const found = prev.find((item) => item.id === id)
      if (found?.output) URL.revokeObjectURL(found.output.url)
      if (found) URL.revokeObjectURL(found.url)
      return prev.filter((item) => item.id !== id)
    })
    setCompareId((current) => (current === id ? null : current))
  }

  function clearAll() {
    stopRef.current = true
    setItems((prev) => {
      for (const item of prev) {
        if (item.output) URL.revokeObjectURL(item.output.url)
        URL.revokeObjectURL(item.url)
      }
      return []
    })
    setCompareId(null)
    setGlobalError(null)
    setBusy(false)
    setSession((s) => s + 1)
  }

  function patchItem(id: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function compressAll() {
    const queue = items.filter((item) => needsCompress(item, settings))
    if (queue.length === 0 || busy) return
    setBusy(true)
    setGlobalError(null)
    stopRef.current = false
    const quality = effectiveQuality(settings.quality)
    const pngLevel = effectiveLevel(settings.pngLevel)
    let failures = 0
    for (const item of queue) {
      if (stopRef.current) break
      if (item.output && !settingsMatch(item.output.settings, settings)) {
        URL.revokeObjectURL(item.output.url)
        patchItem(item.id, { output: null })
      }
      patchItem(item.id, { status: 'working', error: null })
      try {
        const format = resolveFormat(item.file.name, item.file.type, settings.format)
        const result = await worker().api.compress(item.file, {
          format,
          quality,
          pngLevel,
          maxDimension: settings.maxDimension,
          flatten: settings.flatten,
        })
        if (stopRef.current) break
        const blob = new Blob([result.buffer], { type: result.mime })
        const output = {
          blob,
          url: URL.createObjectURL(blob),
          name: outputName(item.file.name, format),
          width: result.width,
          height: result.height,
          format,
          settings: { ...settings },
        }
        setCompareId((current) => current ?? item.id)
        patchItem(item.id, { status: 'done', output, error: null })
      } catch (cause) {
        failures++
        patchItem(item.id, {
          status: 'error',
          error: cause instanceof Error ? cause.message : 'Compression failed.',
        })
      }
    }
    if (failures > 0) {
      setGlobalError(
        `${failures} file${failures === 1 ? '' : 's'} could not be compressed. Very large images can exhaust memory — try a smaller max dimension.`,
      )
    }
    setBusy(false)
  }

  async function downloadAll() {
    const done = items.filter((item) => item.status === 'done' && item.output)
    if (done.length === 0) return
    const entries = await Promise.all(
      done.map(async (item) => ({
        name: item.output!.name,
        data: new Uint8Array(await item.output!.blob.arrayBuffer()),
      })),
    )
    await downloadZip(entries, 'compressed-images.zip')
  }

  const doneItems = items.filter((item) => item.status === 'done' && item.output)
  const totalIn = items.reduce((sum, item) => sum + item.file.size, 0)
  const totalOut = doneItems.reduce((sum, item) => sum + (item.output?.blob.size ?? 0), 0)
  const staleCount = doneItems.filter((item) => needsCompress(item, settings)).length
  const queuedCount = items.filter((item) => needsCompress(item, settings)).length
  const compareItem =
    doneItems.find((item) => item.id === compareId) ?? doneItems[doneItems.length - 1] ?? null
  const showPngLevel = settings.format === 'png'
  const totalSavings = savingsPercent(totalIn, totalOut)

  return (
    <ToolLayout
      title="Image compressor"
      description="Shrink photos with professional encoders and compare the result side by side before downloading. Metadata such as EXIF and GPS is always removed — outputs contain only pixels."
      badge="client-side"
    >
      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-line bg-card p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">Output</span>
            <div role="tablist" aria-label="Output format" className="flex flex-wrap gap-1">
              {FORMAT_ORDER.map((id) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={settings.format === id}
                  onClick={() => setSettings((s) => ({ ...s, format: id as CompressFormat }))}
                  className={cx(
                    'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    settings.format === id
                      ? 'bg-mint text-pine'
                      : 'text-muted hover:bg-soft hover:text-ink',
                  )}
                >
                  {FORMAT_LABELS[id]}
                </button>
              ))}
            </div>
          </div>
          {showPngLevel ? (
            <label className="flex items-center gap-2 text-xs text-muted">
              <span className="font-semibold">Effort</span>
              <input
                type="range"
                min={1}
                max={6}
                value={effectiveLevel(settings.pngLevel)}
                onChange={(e) => setSettings((s) => ({ ...s, pngLevel: Number(e.target.value) }))}
                className="w-32 accent-pine"
              />
              <span className="font-mono tabular-nums">{effectiveLevel(settings.pngLevel)}</span>
            </label>
          ) : (
            <label className="flex items-center gap-2 text-xs text-muted">
              <span className="font-semibold">Quality</span>
              <input
                type="range"
                min={1}
                max={100}
                value={effectiveQuality(settings.quality)}
                onChange={(e) => setSettings((s) => ({ ...s, quality: Number(e.target.value) }))}
                className="w-32 accent-pine"
              />
              <span className="font-mono tabular-nums">{effectiveQuality(settings.quality)}</span>
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="font-semibold">Max size</span>
            <select
              value={settings.maxDimension}
              onChange={(e) => setSettings((s) => ({ ...s, maxDimension: Number(e.target.value) }))}
              className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
            >
              {MAX_DIMENSION_OPTIONS.map((edge) => (
                <option key={edge} value={edge}>
                  {MAX_DIMENSION_LABELS[edge]}
                </option>
              ))}
            </select>
          </label>
          {(settings.format === 'jpeg' || settings.format === 'same') && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <span className="font-semibold">Transparency becomes</span>
              <select
                value={settings.flatten}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, flatten: e.target.value as FlattenColor }))
                }
                className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
              >
                {(Object.keys(FLATTEN_LABELS) as FlattenColor[]).map((color) => (
                  <option key={color} value={color}>
                    {FLATTEN_LABELS[color]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="text-xs text-faint">
          {settings.format === 'png'
            ? 'PNG stays lossless — higher effort squeezes out more bytes but encodes slower.'
            : 'Lower quality means smaller files and more visible artifacts — check the comparison before downloading.'}{' '}
          AVIF encodes slowly on large photos but runs in a background worker.
        </p>
      </div>

      <FileDropzone
        key={session}
        accept="image/*"
        multiple
        onFiles={(files) => void addFiles(files)}
        hint="Drop photos here or click to browse — compresses in batch"
      />

      {compareItem?.output && (
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted">Compare</span>
            <select
              value={compareItem.id}
              onChange={(e) => setCompareId(Number(e.target.value))}
              className="h-8 max-w-64 truncate rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
              aria-label="Choose which result to compare"
            >
              {doneItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.file.name}
                </option>
              ))}
            </select>
            <span className="font-mono text-[11px] text-muted tabular-nums">
              {formatBytes(compareItem.file.size)} → {formatBytes(compareItem.output.blob.size)} ·{' '}
              {savingsPercent(compareItem.file.size, compareItem.output.blob.size) >= 0 ? '−' : '+'}
              {Math.abs(savingsPercent(compareItem.file.size, compareItem.output.blob.size))}%
            </span>
          </div>
          <ComparisonSlider
            beforeUrl={compareItem.url}
            afterUrl={compareItem.output.url}
            beforeLabel={`Original · ${formatBytes(compareItem.file.size)}`}
            afterLabel={`${compareItem.output.format.toUpperCase()} · ${formatBytes(compareItem.output.blob.size)}`}
          />
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void compressAll()} disabled={busy || queuedCount === 0}>
              <Play className="size-4" />
              {busy
                ? 'Compressing…'
                : `Compress ${queuedCount > 0 ? `${queuedCount} file${queuedCount === 1 ? '' : 's'}` : 'all'}`}
            </Button>
            {busy && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  stopRef.current = true
                }}
              >
                <Square className="size-3.5" />
                Stop
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void downloadAll()}
              disabled={doneItems.length === 0}
            >
              <FileArchive className="size-3.5" />
              Download all (.zip)
            </Button>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <Trash2 className="size-3.5" />
              Clear
            </Button>
            {totalOut > 0 && (
              <span className="ml-auto font-mono text-xs text-muted tabular-nums">
                {formatBytes(totalIn)} → {formatBytes(totalOut)} ({totalSavings >= 0 ? '−' : '+'}
                {Math.abs(totalSavings)}%)
              </span>
            )}
          </div>
          {busy && <ProgressBar label="Compressing in background worker…" className="max-w-md" />}
          {staleCount > 0 && !busy && (
            <p className="text-xs text-amber-badge" role="status">
              Settings changed — {staleCount} result{staleCount === 1 ? ' was' : 's were'} made with
              older settings. Compress again to refresh.
            </p>
          )}
          {globalError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {globalError}
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const stale = item.output && !settingsMatch(item.output.settings, settings)
              const scaled =
                settings.maxDimension > 0
                  ? downscaleFactor(item.width, item.height, settings.maxDimension) < 1
                  : false
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-card p-3"
                >
                  {item.thumbUrl ? (
                    <img
                      src={item.thumbUrl}
                      alt=""
                      className="size-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded bg-soft text-faint">
                      <OctagonX className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{item.file.name}</p>
                    <p className="font-mono text-[11px] text-muted tabular-nums">
                      {item.width > 0 ? `${item.width}×${item.height} · ` : ''}
                      {formatBytes(item.file.size)}
                      {scaled && ` → max ${settings.maxDimension}px`}
                      {item.output && (
                        <>
                          {' → '}
                          {formatBytes(item.output.blob.size)} ·{' '}
                          {savingsPercent(item.file.size, item.output.blob.size) >= 0 ? '−' : '+'}
                          {Math.abs(savingsPercent(item.file.size, item.output.blob.size))}%
                          {stale ? ' · older settings' : ''}
                        </>
                      )}
                    </p>
                    {item.error && (
                      <p role="alert" className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                        {item.error}
                      </p>
                    )}
                  </div>
                  <span
                    className={cx(
                      'shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px]',
                      item.status === 'done' && !stale && 'bg-mint text-pine',
                      item.status === 'done' && stale && 'bg-amber-soft text-amber-badge',
                      item.status === 'working' && 'bg-soft text-muted',
                      item.status === 'ready' && 'bg-soft text-muted',
                      item.status === 'error' && 'bg-rose-soft text-rose',
                    )}
                  >
                    {item.status === 'working'
                      ? 'working'
                      : item.status === 'done'
                        ? stale
                          ? 'stale'
                          : 'done'
                        : item.status}
                  </span>
                  {item.output && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadBlob(item.output!.blob, item.output!.name)}
                      aria-label={`Download ${item.output.name}`}
                    >
                      <Download className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem(item.id)}
                    disabled={item.status === 'working'}
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </ToolLayout>
  )
}
