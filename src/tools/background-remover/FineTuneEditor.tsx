import { useCallback, useEffect, useRef, useState } from 'react'
import { Brush, Check, Eraser, Redo2, Trash2, Undo2, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { checkerboard } from './checkerboard'
import {
  activeStrokes,
  canRedo,
  canUndo,
  emptyHistory,
  fitScale,
  mergeAlpha,
  pushStroke,
  redo,
  undo,
  type BrushMode,
  type Stroke,
  type StrokeHistory,
  type StrokePoint,
} from './mask'
import {
  canvasToBlob,
  compositeResult,
  drawStrokes,
  extractAlpha,
  renderCorrections,
} from './render'

/** Overlay tints per spec: stroke being drawn at 0.5 alpha, committed at 0.2. */
const ACTIVE_TINT: Record<BrushMode, string> = {
  keep: 'rgba(34,197,94,0.5)',
  remove: 'rgba(239,68,68,0.5)',
}
const DONE_TINT: Record<BrushMode, string> = {
  keep: 'rgba(34,197,94,0.2)',
  remove: 'rgba(239,68,68,0.2)',
}

interface Loaded {
  original: ImageBitmap
  /** Alpha channel of the AI result at display size (live-preview base). */
  previewBase: Uint8ClampedArray
  /** display px per image px */
  scale: number
  displayWidth: number
  displayHeight: number
}

export interface FineTuneEditorProps {
  /** Object URL of the original photo. */
  sourceUrl: string
  /** Current background-removed result. */
  resultBlob: Blob
  /** Receives the full-resolution corrected PNG. */
  onApply: (blob: Blob) => void
  onCancel: () => void
}

export function FineTuneEditor({ sourceUrl, resultBlob, onApply, onCancel }: FineTuneEditorProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [history, setHistory] = useState<StrokeHistory>(emptyHistory)
  const [mode, setMode] = useState<BrushMode>('remove')
  const [brushSize, setBrushSize] = useState(0) // diameter in image px, set on load
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const resultBitmapRef = useRef<ImageBitmap | null>(null)
  const currentStroke = useRef<Stroke | null>(null)
  const hoverPos = useRef<StrokePoint | null>(null)
  const drawingPointerId = useRef<number | null>(null)
  const applyingRef = useRef(applying)

  useEffect(() => {
    let cancelled = false
    let created: ImageBitmap[] = []
    async function load() {
      try {
        const [original, resultBitmap] = await Promise.all([
          fetch(sourceUrl)
            .then((r) => r.blob())
            .then((b) => createImageBitmap(b)),
          createImageBitmap(resultBlob),
        ])
        created = [original, resultBitmap]
        if (cancelled) {
          for (const bitmap of created) bitmap.close()
          return
        }
        const maxWidth = wrapperRef.current?.clientWidth ?? 800
        const maxHeight = Math.round(window.innerHeight * 0.6)
        const scale = fitScale(original.width, original.height, maxWidth, maxHeight)
        const displayWidth = Math.max(1, Math.round(original.width * scale))
        const displayHeight = Math.max(1, Math.round(original.height * scale))
        resultBitmapRef.current = resultBitmap
        setLoaded({
          original,
          previewBase: extractAlpha(resultBitmap, displayWidth, displayHeight),
          scale: displayWidth / original.width,
          displayWidth,
          displayHeight,
        })
        setBrushSize(Math.max(8, Math.round(Math.min(original.width, original.height) / 20)))
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError(
            'Could not open the editor for this image — it may be too large for this device.',
          )
        }
      }
    }
    void load()
    return () => {
      cancelled = true
      for (const bitmap of created) bitmap.close()
    }
  }, [sourceUrl, resultBlob])

  // Live preview: recomposite at display resolution on stroke end / undo /
  // redo / clear. Cheap — display-size pixels only.
  useEffect(() => {
    if (!loaded) return
    const ctx = previewRef.current?.getContext('2d')
    if (!ctx) return
    const { original, previewBase, scale, displayWidth, displayHeight } = loaded
    const corrections = renderCorrections(
      activeStrokes(history),
      displayWidth,
      displayHeight,
      scale,
    )
    const alpha = mergeAlpha(previewBase, corrections)
    ctx.clearRect(0, 0, displayWidth, displayHeight)
    ctx.drawImage(compositeResult(original, alpha, displayWidth, displayHeight), 0, 0)
  }, [loaded, history])

  const redrawOverlay = useCallback(() => {
    const ctx = overlayRef.current?.getContext('2d')
    if (!ctx || !loaded) return
    ctx.clearRect(0, 0, loaded.displayWidth, loaded.displayHeight)
    drawStrokes(ctx, activeStrokes(history), loaded.scale, DONE_TINT)
    if (currentStroke.current) drawStrokes(ctx, [currentStroke.current], loaded.scale, ACTIVE_TINT)
    if (hoverPos.current && brushSize > 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(
        hoverPos.current.x * loaded.scale,
        hoverPos.current.y * loaded.scale,
        (brushSize * loaded.scale) / 2,
        0,
        Math.PI * 2,
      )
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [loaded, history, brushSize])

  useEffect(() => {
    redrawOverlay()
  }, [redrawOverlay])

  useEffect(() => {
    applyingRef.current = applying
  }, [applying])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      if (applyingRef.current) return
      const key = e.key.toLowerCase()
      if (key === 'z' && e.shiftKey) {
        e.preventDefault()
        setHistory(redo)
      } else if (key === 'z') {
        e.preventDefault()
        setHistory(undo)
      } else if (key === 'y') {
        e.preventDefault()
        setHistory(redo)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function toImagePoint(e: React.PointerEvent<HTMLCanvasElement>): StrokePoint {
    if (!loaded) return { x: 0, y: 0 }
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / loaded.scale,
      y: (e.clientY - rect.top) / loaded.scale,
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!loaded || applying) return
    // Ignore a second finger/palm touch while a stroke is already in progress,
    // and only start strokes from the primary pointer.
    if (currentStroke.current !== null || !e.isPrimary) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingPointerId.current = e.pointerId
    currentStroke.current = { mode, size: brushSize, points: [toImagePoint(e)] }
    redrawOverlay()
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!loaded) return
    if (currentStroke.current) {
      // Only the pointer that started the stroke may append to it.
      if (e.pointerId !== drawingPointerId.current) return
      const point = toImagePoint(e)
      currentStroke.current.points.push(point)
      // Keep the brush-size cursor circle following the drawing pointer.
      hoverPos.current = point
      redrawOverlay()
      return
    }
    if (!e.isPrimary) return
    hoverPos.current = toImagePoint(e)
    redrawOverlay()
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = currentStroke.current
    if (!stroke || e.pointerId !== drawingPointerId.current) return
    currentStroke.current = null
    drawingPointerId.current = null
    setHistory((h) => pushStroke(h, stroke))
  }

  function handlePointerLeave() {
    hoverPos.current = null
    redrawOverlay()
  }

  async function apply() {
    const original = loaded?.original
    const resultBitmap = resultBitmapRef.current
    if (!original || !resultBitmap) return
    setApplying(true)
    setError(null)
    try {
      const { width, height } = original
      const corrections = renderCorrections(activeStrokes(history), width, height, 1)
      const alpha = mergeAlpha(extractAlpha(resultBitmap, width, height), corrections)
      onApply(await canvasToBlob(compositeResult(original, alpha, width, height)))
    } catch (err) {
      console.error(err)
      setError(
        'Applying at full resolution failed — the image may be too large for this device. Your strokes are still here; you can keep editing or cancel.',
      )
    } finally {
      setApplying(false)
    }
  }

  function cancel() {
    if (canUndo(history) && !window.confirm('Discard your fine-tune strokes?')) return
    onCancel()
  }

  const minDim = loaded ? Math.min(loaded.original.width, loaded.original.height) : 0
  const brushMin = Math.max(4, Math.round(minDim / 100))
  const brushMax = Math.max(brushMin + 1, Math.round(minDim / 5))

  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex overflow-hidden rounded-md border border-line-strong">
          {(['keep', 'remove'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cx(
                'flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors not-first:border-l not-first:border-line',
                mode === m
                  ? m === 'keep'
                    ? 'bg-green-600 text-white'
                    : 'bg-red-600 text-white'
                  : 'bg-card text-muted hover:bg-mint',
              )}
            >
              {m === 'keep' ? <Brush className="size-3.5" /> : <Eraser className="size-3.5" />}
              {m === 'keep' ? 'Keep' : 'Remove'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Brush
          <input
            type="range"
            min={brushMin}
            max={brushMax}
            value={brushSize}
            disabled={!loaded}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
        </label>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={!canUndo(history) || applying}
            onClick={() => setHistory(undo)}
            aria-label="Undo"
            title="Undo (Ctrl/Cmd+Z)"
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canRedo(history) || applying}
            onClick={() => setHistory(redo)}
            aria-label="Redo"
            title="Redo (Ctrl/Cmd+Shift+Z)"
          >
            <Redo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canUndo(history) || applying}
            onClick={() => setHistory(emptyHistory)}
            aria-label="Clear all strokes"
            title="Clear all strokes"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            disabled={!loaded || applying || !canUndo(history)}
            onClick={() => void apply()}
          >
            <Check className="size-4" />
            {applying ? 'Applying…' : 'Apply'}
          </Button>
          <Button variant="secondary" size="sm" disabled={applying} onClick={cancel}>
            <X className="size-4" />
            Cancel
          </Button>
        </div>
      </div>

      <div ref={wrapperRef} className="flex justify-center">
        {!loaded && !error && (
          <ProgressBar className="my-10 w-full max-w-md" label="Opening editor…" />
        )}
        {error && (
          <p role="alert" className="my-6 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        {loaded && (
          <div
            className="relative touch-none overflow-hidden rounded-md"
            style={{ width: loaded.displayWidth, height: loaded.displayHeight, ...checkerboard }}
          >
            <img
              src={sourceUrl}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 h-full w-full opacity-25"
            />
            <canvas
              ref={previewRef}
              width={loaded.displayWidth}
              height={loaded.displayHeight}
              className="absolute inset-0"
            />
            <canvas
              ref={overlayRef}
              width={loaded.displayWidth}
              height={loaded.displayHeight}
              className="absolute inset-0 cursor-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={handlePointerLeave}
            />
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-faint">
        Paint green over parts to bring back, red over parts to erase. The preview updates as you
        paint; Apply renders the change at full resolution.
      </p>
    </div>
  )
}
