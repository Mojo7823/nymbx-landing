import { useEffect, useMemo, useState } from 'react'
import ReactCrop, { type Crop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Download, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { ASPECT_PRESETS, centeredRect, clampCrop, outputName, rotatedSize, type Rect } from './crop'

type ExportFormat = 'png' | 'jpeg'

const FULL_FRAME: Crop = { unit: '%', x: 0, y: 0, width: 100, height: 100 }
/** Longest edge of the on-screen preview render (export always uses full resolution). */
const PREVIEW_EDGE_CAP = 1600

interface Source {
  file: File
  bitmap: ImageBitmap
}

function drawTransformed(
  bitmap: ImageBitmap,
  degrees: number,
  flipH: boolean,
  flipV: boolean,
  targetWidth: number,
  targetHeight: number,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(targetWidth, targetHeight)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create a canvas context')
  const radians = (degrees * Math.PI) / 180
  context.translate(targetWidth / 2, targetHeight / 2)
  context.rotate(radians)
  context.scale(flipH ? -1 : 1, flipV ? -1 : 1)
  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  return canvas
}

async function canvasToDataUrl(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not render the preview'))
    reader.readAsDataURL(blob)
  })
}

export default function CropRotateFlip() {
  const [source, setSource] = useState<Source | null>(null)
  const [session, setSession] = useState(0)
  const [aspectId, setAspectId] = useState('free')
  const [rotation90, setRotation90] = useState(0)
  const [fine, setFine] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [cropPct, setCropPct] = useState<Crop>(FULL_FRAME)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState(90)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewDims, setPreviewDims] = useState({ width: 0, height: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debouncedFine = useDebouncedValue(fine, 150)
  const degrees = rotation90 + debouncedFine

  const working = useMemo(
    () =>
      source
        ? rotatedSize(source.bitmap.width, source.bitmap.height, rotation90 + fine)
        : { width: 0, height: 0 },
    [source, rotation90, fine],
  )
  const aspect = ASPECT_PRESETS.find((p) => p.id === aspectId)?.ratio ?? null

  // Re-render the preview from the ORIGINAL bitmap whenever the transform
  // changes. Export does the same at full resolution, so repeated tweaks
  // never accumulate quality loss.
  useEffect(() => {
    if (!source) return
    const live = source
    let stale = false
    async function render() {
      const frame = rotatedSize(live.bitmap.width, live.bitmap.height, degrees)
      const scale = Math.min(1, PREVIEW_EDGE_CAP / Math.max(frame.width, frame.height))
      const canvas = drawTransformed(
        live.bitmap,
        degrees,
        flipH,
        flipV,
        Math.max(1, Math.round(frame.width * scale)),
        Math.max(1, Math.round(frame.height * scale)),
      )
      const url = await canvasToDataUrl(canvas)
      if (stale) return
      setPreviewDims({ width: frame.width, height: frame.height })
      setPreviewUrl(url)
    }
    void render().catch(() => {
      if (!stale) setError('Could not render the preview.')
    })
    return () => {
      stale = true
    }
  }, [source, degrees, flipH, flipV])

  useEffect(
    () => () => {
      source?.bitmap.close()
    },
    [source],
  )

  // Crop in full working-image pixels — the source of truth for export and
  // for the pixel-exact fields below.
  const cropPx: Rect = useMemo(() => {
    if (working.width === 0) return { x: 0, y: 0, width: 0, height: 0 }
    if (cropPct.unit === 'px') {
      return clampCrop(
        { x: cropPct.x, y: cropPct.y, width: cropPct.width, height: cropPct.height },
        working.width,
        working.height,
      )
    }
    return clampCrop(
      {
        x: (cropPct.x * working.width) / 100,
        y: (cropPct.y * working.height) / 100,
        width: (cropPct.width * working.width) / 100,
        height: (cropPct.height * working.height) / 100,
      },
      working.width,
      working.height,
    )
  }, [cropPct, working])

  function setCropFromPx(rect: Rect) {
    if (working.width === 0 || working.height === 0) return
    const clamped = clampCrop(rect, working.width, working.height)
    if (aspect !== null) {
      // Pixel edits keep the locked ratio: width wins, height follows.
      const height = Math.min(working.height, Math.max(1, Math.round(clamped.width / aspect)))
      clamped.height = height
      clamped.y = Math.min(clamped.y, working.height - height)
    }
    setCropPct({
      unit: '%',
      x: (clamped.x * 100) / working.width,
      y: (clamped.y * 100) / working.height,
      width: (clamped.width * 100) / working.width,
      height: (clamped.height * 100) / working.height,
    })
  }

  async function openFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setPreviewUrl(null)
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      setSource((prev) => {
        prev?.bitmap.close()
        return { file, bitmap }
      })
      setRotation90(0)
      setFine(0)
      setFlipH(false)
      setFlipV(false)
      setCropPct(FULL_FRAME)
    } catch {
      setError('Could not decode this image. It may be corrupted or an unsupported type.')
    }
  }

  function resetAll() {
    setSource((prev) => {
      prev?.bitmap.close()
      return null
    })
    setRotation90(0)
    setFine(0)
    setFlipH(false)
    setFlipV(false)
    setCropPct(FULL_FRAME)
    setError(null)
    setPreviewUrl(null)
    setSession((s) => s + 1)
  }

  function rotateStep(delta: number) {
    setRotation90((r) => (((r + delta) % 360) + 360) % 360)
  }

  async function exportImage() {
    if (!source || cropPx.width === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const frame = rotatedSize(source.bitmap.width, source.bitmap.height, degrees)
      const full = drawTransformed(source.bitmap, degrees, flipH, flipV, frame.width, frame.height)
      const out = new OffscreenCanvas(cropPx.width, cropPx.height)
      const context = out.getContext('2d')
      if (!context) throw new Error('Could not create a canvas context')
      if (format === 'jpeg') {
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, cropPx.width, cropPx.height)
      }
      context.drawImage(
        full,
        cropPx.x,
        cropPx.y,
        cropPx.width,
        cropPx.height,
        0,
        0,
        cropPx.width,
        cropPx.height,
      )
      const blob = await out.convertToBlob({
        type: format === 'jpeg' ? 'image/jpeg' : 'image/png',
        quality: quality / 100,
      })
      if (!blob) throw new Error('Export failed.')
      downloadBlob(blob, outputName(source.file.name, format === 'jpeg'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  function onCropComplete(_pixel: unknown, percent: Crop) {
    setCropPct(percent)
  }

  return (
    <ToolLayout
      title="Crop / rotate / flip"
      description="Crop precisely, straighten, and flip photos. Every export re-renders from your original in one pass, so repeated tweaks never degrade quality."
      badge="client-side"
    >
      {!source ? (
        <FileDropzone
          key={session}
          accept="image/*"
          onFiles={(files) => void openFile(files[0])}
          hint="One photo at a time — PNG, JPEG or WebP"
        />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-line bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted">Crop shape</span>
              <div role="tablist" aria-label="Aspect ratio" className="flex flex-wrap gap-1">
                {ASPECT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    role="tab"
                    aria-selected={aspectId === preset.id}
                    onClick={() => {
                      setAspectId(preset.id)
                      const frame = rotatedSize(source.bitmap.width, source.bitmap.height, degrees)
                      const centered = centeredRect(frame.width, frame.height, preset.ratio)
                      setCropPct({
                        unit: '%',
                        x: (centered.x * 100) / frame.width,
                        y: (centered.y * 100) / frame.height,
                        width: (centered.width * 100) / frame.width,
                        height: (centered.height * 100) / frame.height,
                      })
                    }}
                    className={cx(
                      'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                      aspectId === preset.id
                        ? 'bg-mint text-pine'
                        : 'text-muted hover:bg-soft hover:text-ink',
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-muted">Rotate</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => rotateStep(-90)}
                aria-label="Rotate left 90 degrees"
              >
                <RotateCcw className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => rotateStep(90)}
                aria-label="Rotate right 90 degrees"
              >
                <RotateCw className="size-4" />
              </Button>
              <label className="flex items-center gap-2 text-xs text-muted">
                <span className="font-semibold">Fine</span>
                <input
                  type="range"
                  min={-45}
                  max={45}
                  step={0.5}
                  value={fine}
                  onChange={(e) => setFine(Number(e.target.value))}
                  className="w-28 accent-pine"
                  aria-label="Fine rotation in degrees"
                />
                <span className="w-14 font-mono tabular-nums">
                  {(((degrees % 360) + 360) % 360).toFixed(1)}°
                </span>
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFlipH((v) => !v)}
                aria-pressed={flipH}
                aria-label="Flip horizontally"
                title="Flip horizontally"
              >
                <FlipHorizontal2 className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFlipV((v) => !v)}
                aria-pressed={flipV}
                aria-label="Flip vertically"
                title="Flip vertically"
              >
                <FlipVertical2 className="size-4" />
              </Button>
            </div>
          </div>

          {previewUrl && previewDims.width > 0 && (
            <div className="mx-auto w-full max-w-3xl">
              <ReactCrop
                crop={cropPct}
                onChange={(_, percent) => setCropPct(percent)}
                onComplete={onCropComplete}
                aspect={aspect ?? undefined}
                ruleOfThirds
              >
                <img src={previewUrl} alt="Photo to crop" />
              </ReactCrop>
              <p className="mt-1.5 text-center font-mono text-[11px] text-muted tabular-nums">
                Output {cropPx.width}×{cropPx.height}px · working frame {working.width}×
                {working.height}px
              </p>
            </div>
          )}

          <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ['x', 'X', working.width],
                ['y', 'Y', working.height],
                ['width', 'Width', working.width],
                ['height', 'Height', working.height],
              ] as const
            ).map(([key, label, max]) => (
              <label key={key} className="flex flex-col gap-1 text-xs text-muted">
                <span className="font-semibold">
                  {label} <span className="font-normal text-faint">px</span>
                </span>
                <input
                  type="number"
                  min={key === 'width' || key === 'height' ? 1 : 0}
                  max={max}
                  value={Math.round(cropPx[key])}
                  onChange={(e) => setCropFromPx({ ...cropPx, [key]: Number(e.target.value) })}
                  className="h-9 w-full rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink tabular-nums focus:border-pine focus:outline-none"
                />
              </label>
            ))}
          </div>

          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted">Export</span>
              <div role="tablist" aria-label="Export format" className="flex gap-1">
                {(['png', 'jpeg'] as const).map((id) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={format === id}
                    onClick={() => setFormat(id)}
                    className={cx(
                      'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                      format === id
                        ? 'bg-mint text-pine'
                        : 'text-muted hover:bg-soft hover:text-ink',
                    )}
                  >
                    {id.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {format === 'jpeg' && (
              <label className="flex items-center gap-2 text-xs text-muted">
                <span className="font-semibold">Quality</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-32 accent-pine"
                />
                <span className="font-mono tabular-nums">{quality}</span>
              </label>
            )}
            <Button onClick={() => void exportImage()} disabled={busy || cropPx.width === 0}>
              <Download className="size-4" />
              {busy
                ? 'Exporting…'
                : `Download ${cropPx.width}×${cropPx.height} ${format.toUpperCase()}`}
            </Button>
            <Button variant="ghost" size="sm" onClick={resetAll}>
              Choose another
            </Button>
          </div>

          {busy && <ProgressBar label="Exporting…" className="mx-auto w-full max-w-3xl" />}
          {error && (
            <p
              role="alert"
              className="mx-auto w-full max-w-3xl text-sm text-red-600 dark:text-red-400"
            >
              {error}
            </p>
          )}
          <p className="mx-auto w-full max-w-3xl text-xs text-faint">
            Original {source.bitmap.width}×{source.bitmap.height}px · {source.file.name} is never
            modified — every tweak re-renders from the untouched original.
          </p>
        </div>
      )}
    </ToolLayout>
  )
}
