import { useEffect, useRef, useState } from 'react'
import { Download, FileArchive, OctagonX, Play, Square, Trash2, TriangleAlert } from 'lucide-react'
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
  effectiveQuality,
  FLATTEN_LABELS,
  FORMAT_ORDER,
  FORMATS,
  hasTransparency,
  outputName,
  savingsPercent,
  type ConvertSettings,
  type FlattenColor,
  type OutputFormat,
} from './converter'
import type { ConvertWorkerApi } from './convert.worker'

type ItemStatus = 'ready' | 'working' | 'done' | 'error'

interface Item {
  id: number
  file: File
  thumbUrl: string
  width: number
  height: number
  transparent: boolean
  status: ItemStatus
  output: {
    blob: Blob
    url: string
    name: string
    settings: ConvertSettings
  } | null
  error: string | null
}

/** Cap for the alpha-detection canvas; thumbnails use their own smaller cap. */
const ALPHA_EDGE_CAP = 2048

async function inspectImage(
  file: File,
): Promise<{ thumbUrl: string; width: number; height: number; transparent: boolean }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const width = bitmap.width
    const height = bitmap.height
    const alphaScale = Math.min(1, ALPHA_EDGE_CAP / Math.max(width, height))
    const alphaCanvas = document.createElement('canvas')
    alphaCanvas.width = Math.max(1, Math.round(width * alphaScale))
    alphaCanvas.height = Math.max(1, Math.round(height * alphaScale))
    const alphaCtx = alphaCanvas.getContext('2d', { willReadFrequently: true })
    if (!alphaCtx) throw new Error('Could not create a canvas context')
    alphaCtx.drawImage(bitmap, 0, 0, alphaCanvas.width, alphaCanvas.height)
    const transparent = hasTransparency(
      alphaCtx.getImageData(0, 0, alphaCanvas.width, alphaCanvas.height).data,
    )

    const thumbScale = Math.min(1, 96 / Math.max(width, height))
    const thumb = document.createElement('canvas')
    thumb.width = Math.max(1, Math.round(width * thumbScale))
    thumb.height = Math.max(1, Math.round(height * thumbScale))
    thumb.getContext('2d')?.drawImage(bitmap, 0, 0, thumb.width, thumb.height)
    return { thumbUrl: thumb.toDataURL(), width, height, transparent }
  } finally {
    bitmap.close()
  }
}

let nextId = 1

function settingsMatch(a: ConvertSettings, b: ConvertSettings): boolean {
  return a.format === b.format && a.quality === b.quality && a.flatten === b.flatten
}

/** Items that still need (re-)conversion, including stale results. */
function needsConvert(item: Item, settings: ConvertSettings): boolean {
  if (item.status === 'ready' || item.status === 'error') return true
  if (item.status === 'done' && item.output) {
    return !settingsMatch(item.output.settings, settings)
  }
  return false
}

export default function ImageFormatConverter() {
  const [settings, setSettings] = useState<ConvertSettings>(defaultSettings)
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  // Bumped on Clear so the dropzone remounts with an empty input: otherwise
  // re-picking the same file fires no change event and silently does nothing.
  const [session, setSession] = useState(0)
  const workerRef = useRef<WorkerHandle<ConvertWorkerApi> | null>(null)
  const stopRef = useRef(false)

  useEffect(() => () => workerRef.current?.terminate(), [])

  function worker(): WorkerHandle<ConvertWorkerApi> {
    workerRef.current ??= wrapWorker<ConvertWorkerApi>(
      new Worker(new URL('./convert.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current
  }

  async function addFiles(files: File[]) {
    if (files.length === 0 || busy) return
    setGlobalError(null)
    for (const file of files) {
      const id = nextId++
      try {
        const info = await inspectImage(file)
        setItems((prev) => [
          ...prev,
          { id, file, ...info, status: 'ready', output: null, error: null },
        ])
      } catch {
        setItems((prev) => [
          ...prev,
          {
            id,
            file,
            thumbUrl: '',
            width: 0,
            height: 0,
            transparent: false,
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
      return prev.filter((item) => item.id !== id)
    })
  }

  function clearAll() {
    stopRef.current = true
    setItems((prev) => {
      for (const item of prev) if (item.output) URL.revokeObjectURL(item.output.url)
      return []
    })
    setGlobalError(null)
    setBusy(false)
    setSession((s) => s + 1)
  }

  function patchItem(id: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function convertAll() {
    const queue = items.filter((item) => needsConvert(item, settings))
    if (queue.length === 0 || busy) return
    setBusy(true)
    setGlobalError(null)
    stopRef.current = false
    const quality = effectiveQuality(settings)
    let failures = 0
    for (const item of queue) {
      if (stopRef.current) break
      // Drop a previous output made with different settings before re-running.
      if (item.output && !settingsMatch(item.output.settings, settings)) {
        URL.revokeObjectURL(item.output.url)
        patchItem(item.id, { output: null })
      }
      patchItem(item.id, { status: 'working', error: null })
      try {
        const result = await worker().api.convert(item.file, {
          format: settings.format,
          quality,
          flatten: settings.flatten,
        })
        if (stopRef.current) break
        const name = outputName(item.file.name, settings.format)
        const blob = new Blob([result.buffer], { type: result.mime })
        const output = {
          blob,
          url: URL.createObjectURL(blob),
          name,
          settings: { ...settings },
        }
        const prev = items.find((i) => i.id === item.id)?.output
        if (prev) URL.revokeObjectURL(prev.url)
        patchItem(item.id, { status: 'done', output, error: null })
      } catch (cause) {
        failures++
        patchItem(item.id, {
          status: 'error',
          error: cause instanceof Error ? cause.message : 'Conversion failed.',
        })
      }
    }
    if (failures > 0) {
      setGlobalError(
        `${failures} file${failures === 1 ? '' : 's'} could not be converted. Very large images can exhaust memory — try smaller copies.`,
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
    await downloadZip(entries, `converted-${settings.format}.zip`)
  }

  const def = FORMATS[settings.format]
  const doneItems = items.filter((item) => item.status === 'done' && item.output)
  const totalIn = items.reduce((sum, item) => sum + item.file.size, 0)
  const totalOut = doneItems.reduce((sum, item) => sum + (item.output?.blob.size ?? 0), 0)
  const staleCount = doneItems.filter((item) => needsConvert(item, settings)).length
  const flattenWarning =
    settings.format === 'jpeg' && items.some((item) => item.transparent && item.status !== 'error')
  const queuedCount = items.filter((item) => needsConvert(item, settings)).length

  return (
    <ToolLayout
      title="Image format converter"
      description="Convert between PNG, JPEG, WebP, and AVIF with per-format quality control. Encoded locally with professional codecs; your photos never leave this device."
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
                  onClick={() => setSettings((s) => ({ ...s, format: id as OutputFormat }))}
                  className={cx(
                    'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    settings.format === id
                      ? 'bg-mint text-pine'
                      : 'text-muted hover:bg-soft hover:text-ink',
                  )}
                >
                  {FORMATS[id].label}
                </button>
              ))}
            </div>
          </div>
          {def.quality ? (
            <label className="flex items-center gap-2 text-xs text-muted">
              <span className="font-semibold">Quality</span>
              <input
                type="range"
                min={def.quality.min}
                max={def.quality.max}
                value={Math.min(def.quality.max, Math.max(def.quality.min, settings.quality))}
                onChange={(e) => setSettings((s) => ({ ...s, quality: Number(e.target.value) }))}
                className="w-32 accent-pine"
              />
              <span className="font-mono tabular-nums">{effectiveQuality(settings)}</span>
            </label>
          ) : (
            <span className="text-xs text-faint">PNG is lossless — no quality setting needed.</span>
          )}
          {settings.format === 'jpeg' && (
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
          {def.blurb}{' '}
          {settings.format === 'avif' &&
            'AVIF encodes slowly on large photos — it runs in a background worker, so the page stays responsive.'}
        </p>
        {flattenWarning && (
          <p className="flex items-start gap-1.5 text-xs text-amber-badge" role="status">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />A transparent image becomes{' '}
            {FLATTEN_LABELS[settings.flatten].toLowerCase()} in JPEG. Pick WebP, AVIF, or PNG to
            keep transparency.
          </p>
        )}
      </div>

      <FileDropzone
        key={session}
        accept="image/*"
        multiple
        onFiles={(files) => void addFiles(files)}
        hint="Drop photos here or click to browse — converts in batch"
      />

      {items.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void convertAll()} disabled={busy || queuedCount === 0}>
              <Play className="size-4" />
              {busy
                ? 'Converting…'
                : `Convert ${queuedCount > 0 ? `${queuedCount} file${queuedCount === 1 ? '' : 's'}` : 'all'}`}
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
                {formatBytes(totalIn)} → {formatBytes(totalOut)} (
                {savingsPercent(totalIn, totalOut) >= 0 ? '−' : '+'}
                {Math.abs(savingsPercent(totalIn, totalOut))}%)
              </span>
            )}
          </div>
          {busy && <ProgressBar label="Converting in background worker…" className="max-w-md" />}
          {staleCount > 0 && !busy && (
            <p className="text-xs text-amber-badge" role="status">
              Settings changed — {staleCount} result{staleCount === 1 ? ' was' : 's were'} made with
              older settings. Convert again to refresh.
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
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-card p-3"
                >
                  {item.output && !needsConvert(item, settings) ? (
                    <img
                      src={item.output.url}
                      alt={`Converted ${item.output.name}`}
                      className="size-12 shrink-0 rounded border border-line object-cover"
                    />
                  ) : item.thumbUrl ? (
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
                      {item.output && (
                        <>
                          {' → '}
                          {formatBytes(item.output.blob.size)} ·{' '}
                          {savingsPercent(item.file.size, item.output.blob.size) >= 0 ? '−' : '+'}
                          {Math.abs(savingsPercent(item.file.size, item.output.blob.size))}%
                          {stale ? ' · older settings' : ''}
                        </>
                      )}
                      {item.transparent && item.status !== 'error' && ' · has transparency'}
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
