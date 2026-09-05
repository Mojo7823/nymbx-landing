import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Brush, ClipboardCopy, Download, Eraser, Redo2, Square, Trash2, Undo2 } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { ProgressBar } from '../../components/ProgressBar'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import { getSetting, setSetting } from '../../lib/settings'
import { toast } from '../../lib/toast'
import { canRedo, canUndo, commit, emptyHistory, redo, undo, type History } from '../../lib/history'
import { Editor, type EditorTool } from './Editor'
import { ACCEPTED_TYPES, MAX_IMAGE_BYTES, decodeImage, imageFromPaste } from './loadImage'
import { DEFAULT_BLOCK, MAX_BLOCK, MIN_BLOCK, clampBlock } from './pixelate'
import { encodeCanvas, outputName, type ExportFormat } from './render'
import {
  DEFAULT_BRUSH,
  DEFAULT_COLOR,
  MAX_BRUSH,
  MIN_BRUSH,
  clampBrushSize,
  createBrush,
  createRect,
  formatRegionSize,
  modeLabel,
  regionCountLabel,
  regionLabel,
  removeRegion,
  replaceRegion,
  type Box,
  type Point,
  type RedactMode,
  type Region,
} from './regions'

const SETTINGS_KEY = 'screenshotRedaction'
const METADATA_NOTE =
  'Stays in your browser. The export is re-encoded, so EXIF, GPS and other metadata are removed.'
const ZOOM_LEVELS: { value: string; label: string }[] = [
  { value: 'fit', label: 'Fit' },
  { value: '0.5', label: '50%' },
  { value: '1', label: '100%' },
  { value: '2', label: '200%' },
  { value: '4', label: '400%' },
]

interface Prefs {
  mode: RedactMode
  color: string
  block: number
  brush: number
  format: ExportFormat
  quality: number
}

const DEFAULT_PREFS: Prefs = {
  mode: 'black',
  color: DEFAULT_COLOR,
  block: DEFAULT_BLOCK,
  brush: DEFAULT_BRUSH,
  format: 'png',
  quality: 90,
}

interface Source {
  file: File
  bitmap: ImageBitmap
}

export default function ScreenshotRedaction() {
  const [source, setSource] = useState<Source | null>(null)
  const [session, setSession] = useState(0)
  const [history, setHistory] = useState<History<Region[]>>(() => emptyHistory<Region[]>([]))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<EditorTool>('rect')
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [zoom, setZoom] = useState('fit')
  const [busy, setBusy] = useState(false)
  const [decoding, setDecoding] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const regions = history.present
  const style = useMemo(
    () => ({ mode: prefs.mode, color: prefs.color, block: prefs.block }),
    [prefs.mode, prefs.color, prefs.block],
  )

  // ── Preferences (never any image data) ────────────────────────────────
  useEffect(() => {
    let cancelled = false
    void getSetting(SETTINGS_KEY).then((stored) => {
      if (cancelled || !stored || typeof stored !== 'object') return
      const saved = stored as Partial<Prefs>
      setPrefs((prev) => ({
        mode: saved.mode === 'pixelate' ? 'pixelate' : prev.mode,
        color: typeof saved.color === 'string' ? saved.color : prev.color,
        block: clampBlock(typeof saved.block === 'number' ? saved.block : prev.block),
        brush: clampBrushSize(typeof saved.brush === 'number' ? saved.brush : prev.brush),
        format: saved.format === 'jpeg' ? 'jpeg' : prev.format,
        quality:
          typeof saved.quality === 'number'
            ? Math.min(100, Math.max(60, saved.quality))
            : prev.quality,
      }))
    })
    return () => {
      cancelled = true
    }
  }, [])

  function updatePrefs(patch: Partial<Prefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      void setSetting(SETTINGS_KEY, next)
      return next
    })
  }

  /** Style changes apply to the selected region as one history step. */
  function restyleSelected(patch: Partial<Pick<Region, 'mode' | 'color' | 'block'>>) {
    if (!selectedId) return
    setHistory((h) => {
      const current = h.present.find((r) => r.id === selectedId)
      if (!current) return h
      return commit(h, replaceRegion(h.present, { ...current, ...patch }))
    })
  }

  // ── Loading ───────────────────────────────────────────────────────────
  const openFile = useCallback(async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      toast('That image is larger than 50 MB', { variant: 'error' })
      return
    }
    setDecoding(true)
    try {
      const bitmap = await decodeImage(file)
      setSource((prev) => {
        prev?.bitmap.close()
        return { file, bitmap }
      })
      setHistory(emptyHistory<Region[]>([]))
      setSelectedId(null)
      setZoom('fit')
    } catch {
      toast('Could not read that image', { variant: 'error' })
    } finally {
      setDecoding(false)
    }
  }, [])

  useEffect(
    () => () => {
      source?.bitmap.close()
    },
    [source],
  )

  // Ctrl/⌘+V anywhere on the page loads a screenshot from the clipboard.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const file = imageFromPaste(event)
      if (!file) return
      event.preventDefault()
      void openFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [openFile])

  // ── Editing ───────────────────────────────────────────────────────────
  function addRegion(region: Region) {
    setHistory((h) => commit(h, [...h.present, region]))
    setSelectedId(region.id)
  }

  function onCreateRect(box: Box) {
    addRegion(createRect(box, style))
  }

  function onCreateBrush(points: Point[]) {
    addRegion(createBrush(points, prefs.brush, style))
  }

  function onCommitRegion(region: Region) {
    setHistory((h) => commit(h, replaceRegion(h.present, region)))
  }

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    setHistory((h) => commit(h, removeRegion(h.present, selectedId)))
    setSelectedId(null)
  }, [selectedId])

  function clearAll() {
    if (regions.length === 0) return
    setHistory((h) => commit(h, []))
    setSelectedId(null)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (typing) return

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() !== 'z') return
        e.preventDefault()
        setHistory(e.shiftKey ? redo : undo)
        setSelectedId(null)
        return
      }
      if (e.key === 'Escape') setSelectedId(null)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelected])

  // ── Export ────────────────────────────────────────────────────────────
  async function renderExport(format: ExportFormat): Promise<Blob | null> {
    const canvas = canvasRef.current
    if (!canvas) return null
    return await encodeCanvas(canvas, format, prefs.quality)
  }

  async function download() {
    if (!source || busy) return
    setBusy(true)
    try {
      const blob = await renderExport(prefs.format)
      if (!blob) throw new Error('nothing to export')
      downloadBlob(blob, outputName(source.file.name, prefs.format))
      toast('Downloaded. The export was re-encoded, so EXIF, GPS and other metadata are gone.', {
        variant: 'success',
      })
    } catch {
      toast('Could not export that image', { variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function copyImage() {
    if (!source || busy) return
    setBusy(true)
    try {
      const blob = await renderExport('png')
      if (!blob) throw new Error('nothing to copy')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast('Copied to clipboard', { variant: 'success' })
    } catch {
      toast('This browser would not let the page copy an image', { variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  function replaceImage() {
    if (regions.length > 0 && !window.confirm('Discard this image and its redactions?')) return
    setSource((prev) => {
      prev?.bitmap.close()
      return null
    })
    setHistory(emptyHistory<Region[]>([]))
    setSelectedId(null)
    setSession((s) => s + 1)
  }

  return (
    <ToolLayout
      title="Screenshot redaction"
      description="Black out or pixelate anything sensitive before you share a screenshot — the pixels are destroyed, not covered"
      badge="client-side"
    >
      {!source ? (
        <div className="mx-auto max-w-2xl">
          <FileDropzone
            key={session}
            accept={ACCEPTED_TYPES}
            maxSize={MAX_IMAGE_BYTES}
            onFiles={(files) => void openFile(files[0])}
            hint="One screenshot at a time — PNG, JPEG, WebP, GIF or BMP, up to 50 MB"
          />
          {decoding && <ProgressBar className="mt-3" label="Decoding image…" />}
          <p className="mt-3 text-center text-sm text-muted">
            …or press <kbd className="rounded border border-line px-1 font-mono text-xs">Ctrl</kbd>/
            <kbd className="rounded border border-line px-1 font-mono text-xs">⌘</kbd>+
            <kbd className="rounded border border-line px-1 font-mono text-xs">V</kbd> to paste a
            screenshot
          </p>
          <p className="mt-2 text-center text-xs text-faint">{METADATA_NOTE}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-line bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted">Tool</span>
              <div role="tablist" aria-label="Drawing tool" className="flex gap-1">
                {(
                  [
                    ['rect', 'Rectangle', Square],
                    ['brush', 'Brush', Brush],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tool === id}
                    onClick={() => setTool(id)}
                    className={cx(
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                      tool === id ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {tool === 'brush' && (
              <label className="flex items-center gap-2 text-xs text-muted">
                <span className="font-semibold">Brush</span>
                <input
                  type="range"
                  min={MIN_BRUSH}
                  max={MAX_BRUSH}
                  value={prefs.brush}
                  onChange={(e) => updatePrefs({ brush: clampBrushSize(Number(e.target.value)) })}
                  className="w-28 accent-pine"
                  aria-label="Brush size in image pixels"
                />
                <span className="w-10 font-mono tabular-nums">{prefs.brush}px</span>
              </label>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted">Mode</span>
              <div role="tablist" aria-label="Redaction mode" className="flex gap-1">
                {(
                  [
                    ['black', 'Black-out'],
                    ['pixelate', 'Pixelate'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={prefs.mode === id}
                    onClick={() => {
                      updatePrefs({ mode: id })
                      restyleSelected({ mode: id })
                    }}
                    className={cx(
                      'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                      prefs.mode === id
                        ? 'bg-mint text-pine'
                        : 'text-muted hover:bg-soft hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {prefs.mode === 'black' ? (
              <label className="flex items-center gap-2 text-xs text-muted">
                <span className="font-semibold">Colour</span>
                <input
                  type="color"
                  value={prefs.color}
                  onChange={(e) => {
                    updatePrefs({ color: e.target.value })
                    restyleSelected({ color: e.target.value })
                  }}
                  className="h-7 w-10 cursor-pointer rounded border border-line-strong bg-card"
                  aria-label="Black-out colour"
                />
              </label>
            ) : (
              <label className="flex items-center gap-2 text-xs text-muted">
                <span className="font-semibold">Block</span>
                <input
                  type="range"
                  min={MIN_BLOCK}
                  max={MAX_BLOCK}
                  step={1}
                  value={prefs.block}
                  onChange={(e) => {
                    const block = clampBlock(Number(e.target.value))
                    updatePrefs({ block })
                    restyleSelected({ block })
                  }}
                  className="w-28 accent-pine"
                  aria-label="Mosaic block size in pixels"
                />
                <span className="w-10 font-mono tabular-nums">{prefs.block}px</span>
              </label>
            )}

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={!canUndo(history)}
                onClick={() => {
                  setHistory(undo)
                  setSelectedId(null)
                }}
                aria-label="Undo"
                title="Undo (Ctrl/Cmd+Z)"
              >
                <Undo2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!canRedo(history)}
                onClick={() => {
                  setHistory(redo)
                  setSelectedId(null)
                }}
                aria-label="Redo"
                title="Redo (Ctrl/Cmd+Shift+Z)"
              >
                <Redo2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!selectedId}
                onClick={deleteSelected}
                aria-label="Delete selected region"
                title="Delete (Del)"
              >
                <Eraser className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={regions.length === 0}
                onClick={clearAll}
                aria-label="Clear all regions"
                title="Clear all regions"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            <label className="flex items-center gap-2 text-xs text-muted">
              <span className="font-semibold">Zoom</span>
              <select
                value={zoom}
                onChange={(e) => setZoom(e.target.value)}
                className="h-8 cursor-pointer rounded-md border border-line-strong bg-card px-2 text-xs text-ink"
                aria-label="Zoom"
              >
                {ZOOM_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={prefs.format}
                onChange={(e) => updatePrefs({ format: e.target.value as ExportFormat })}
                className="h-8 cursor-pointer rounded-md border border-line-strong bg-card px-2 text-xs text-ink"
                aria-label="Export format"
              >
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
              </select>
              {prefs.format === 'jpeg' && (
                <label className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-semibold">Quality</span>
                  <input
                    type="range"
                    min={60}
                    max={100}
                    value={prefs.quality}
                    onChange={(e) => updatePrefs({ quality: Number(e.target.value) })}
                    className="w-24 accent-pine"
                    aria-label="JPEG quality"
                  />
                  <span className="w-8 font-mono tabular-nums">{prefs.quality}</span>
                </label>
              )}
              {typeof ClipboardItem !== 'undefined' && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void copyImage()}
                >
                  <ClipboardCopy className="size-4" />
                  Copy image
                </Button>
              )}
              <Button size="sm" disabled={busy} onClick={() => void download()}>
                <Download className="size-4" />
                {busy ? 'Preparing…' : 'Download'}
              </Button>
            </div>
          </div>

          <p className="text-xs text-faint">
            Pixelation can leak short text at small block sizes — use black-out for text you must
            hide. {METADATA_NOTE}
          </p>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <Editor
              bitmap={source.bitmap}
              regions={regions}
              selectedId={selectedId}
              tool={tool}
              brushSize={prefs.brush}
              previewColor={prefs.mode === 'black' ? prefs.color : '#334155'}
              zoom={zoom === 'fit' ? 'fit' : Number(zoom)}
              canvasRef={canvasRef}
              onSelect={setSelectedId}
              onCreateRect={onCreateRect}
              onCreateBrush={onCreateBrush}
              onCommitRegion={onCommitRegion}
            />

            <aside className="min-w-0">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <h2 className="text-sm font-semibold text-ink">Regions</h2>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {regionCountLabel(regions.length)}
                </span>
              </div>
              {regions.length === 0 ? (
                <p className="mt-3 text-xs text-muted">
                  Drag on the screenshot to draw a redaction. Every region is burned into the pixels
                  you see — the preview is the export.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {regions.map((region) => (
                    <li key={region.id}>
                      <div
                        className={cx(
                          'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                          region.id === selectedId
                            ? 'border-pine bg-mint'
                            : 'border-line bg-card hover:bg-soft',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(region.id)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                          aria-pressed={region.id === selectedId}
                        >
                          {region.kind === 'rect' ? (
                            <Square className="size-3.5 shrink-0 text-faint" />
                          ) : (
                            <Brush className="size-3.5 shrink-0 text-faint" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-ink">
                              {regionLabel(region)}
                              <span className="text-muted"> · {modeLabel(region.mode)}</span>
                            </span>
                            <span className="block font-mono text-[11px] text-muted tabular-nums">
                              {formatRegionSize(region)}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setHistory((h) =>
                              commit(
                                h,
                                replaceRegion(h.present, {
                                  ...region,
                                  mode: region.mode === 'black' ? 'pixelate' : 'black',
                                }),
                              ),
                            )
                          }
                          className="cursor-pointer rounded px-1 py-0.5 text-[11px] font-semibold text-muted hover:bg-card hover:text-ink"
                          aria-label={`Switch ${regionLabel(region)} to ${
                            region.mode === 'black' ? 'pixelate' : 'black-out'
                          }`}
                        >
                          {region.mode === 'black' ? 'Pixelate' : 'Black'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHistory((h) => commit(h, removeRegion(h.present, region.id)))
                            setSelectedId((id) => (id === region.id ? null : id))
                          }}
                          className="cursor-pointer rounded p-1 text-muted hover:bg-card hover:text-red-600"
                          aria-label={`Delete ${regionLabel(region)}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3 text-xs text-faint">
                <span className="font-mono tabular-nums">
                  {source.bitmap.width}×{source.bitmap.height}px · {source.file.name}
                </span>
                <span>Your file is never modified, uploaded or stored.</span>
                <Button variant="secondary" size="sm" onClick={replaceImage}>
                  Replace image
                </Button>
              </div>
            </aside>
          </div>
        </div>
      )}
    </ToolLayout>
  )
}
