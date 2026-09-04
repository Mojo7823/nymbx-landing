import { useEffect, useRef, useState } from 'react'
import { Download, Pipette, RotateCcw } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import {
  bestTextOn,
  buildPaletteCss,
  buildPaletteText,
  contrastRatio,
  formatColor,
  formatHsl,
  formatRgb,
  hexToRgb,
  rgbToHexString,
  rgbToHsl,
  suggestContrastPairs,
  type ColorFormat,
  type PaletteColor,
  type Rgb,
} from './palette'
import type { PaletteWorkerApi } from './palette.worker'

type Stage = 'idle' | 'working' | 'ready' | 'error'

interface Loaded {
  file: File
  url: string
  width: number
  height: number
}

interface Sample {
  data: Uint8ClampedArray
  width: number
  height: number
}

interface Picked {
  rgb: Rgb
  source: 'image' | 'screen'
}

/** Longest edge of the downsampled bitmap the worker analyzes. */
const ANALYSIS_EDGE = 256

interface EyeDropperInstance {
  open: () => Promise<{ sRGBHex: string }>
}

function eyeDropperCtor(): (new () => EyeDropperInstance) | null {
  const ctor = (window as unknown as { EyeDropper?: new () => EyeDropperInstance }).EyeDropper
  return ctor ?? null
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

const FORMAT_LABELS: Record<ColorFormat, string> = {
  hex: 'HEX',
  rgb: 'RGB',
  hsl: 'HSL',
}

export default function ColorPaletteExtractor() {
  const [stage, setStage] = useState<Stage>('idle')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [sample, setSample] = useState<Sample | null>(null)
  const [palette, setPalette] = useState<PaletteColor[]>([])
  const [colorCount, setColorCount] = useState(6)
  const [format, setFormat] = useState<ColorFormat>('hex')
  const [extracting, setExtracting] = useState(false)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [session, setSession] = useState(0)

  const workerRef = useRef<WorkerHandle<PaletteWorkerApi> | null>(null)
  const requestRef = useRef(0)
  const extractRunRef = useRef(0)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // React docs cleanup pattern: terminate the worker and revoke the object
  // URL when the page unmounts; per-file URLs are revoked on replace/reset.
  useEffect(
    () => () => {
      workerRef.current?.terminate()
      clearTimeout(copyTimer.current)
      setLoaded((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return prev
      })
    },
    [],
  )

  function ensureWorker(): WorkerHandle<PaletteWorkerApi> {
    workerRef.current ??= wrapWorker<PaletteWorkerApi>(
      // Separate chunk in the production build (per Vite's ?worker-style
      // `new URL(..., import.meta.url)` handling), so the dashboard bundle
      // stays light until this route opens.
      new Worker(new URL('./palette.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current
  }

  function discardLoaded() {
    setLoaded((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  async function openFile(file: File | undefined) {
    if (!file) return
    const request = requestRef.current + 1
    requestRef.current = request
    extractRunRef.current += 1
    setStage('working')
    setError(null)
    setPicked(null)
    setCopiedIndex(null)
    discardLoaded()
    setSample(null)
    setPalette([])
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      try {
        const scale = Math.min(1, ANALYSIS_EDGE / Math.max(bitmap.width, bitmap.height))
        const width = Math.max(1, Math.round(bitmap.width * scale))
        const height = Math.max(1, Math.round(bitmap.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Could not create a canvas context.')
        context.drawImage(bitmap, 0, 0, width, height)
        const rgba = new Uint8ClampedArray(context.getImageData(0, 0, width, height).data)
        if (requestRef.current !== request) return
        setLoaded({
          file,
          url: URL.createObjectURL(file),
          width: bitmap.width,
          height: bitmap.height,
        })
        setSample({ data: rgba, width, height })
        const colors = await ensureWorker().api.extract(rgba, colorCount)
        if (requestRef.current !== request) return
        setPalette(colors)
        setStage('ready')
      } finally {
        bitmap.close()
      }
    } catch (cause) {
      if (requestRef.current !== request) return
      discardLoaded()
      setStage('error')
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Could not decode this image. Try a PNG, JPEG, WebP or GIF file.',
      )
    }
  }

  // Re-run the (fast) worker extraction when the color count changes, reusing
  // the cached analysis pixels instead of re-decoding the file. This runs
  // from the slider's change event — not an effect — so no cascading renders.
  function changeCount(next: number) {
    setColorCount(next)
    if (!sample || stage !== 'ready') return
    const run = extractRunRef.current + 1
    extractRunRef.current = run
    setExtracting(true)
    ensureWorker()
      .api.extract(sample.data, next)
      .then((colors) => {
        if (extractRunRef.current === run) setPalette(colors)
      })
      .catch(() => {
        /* keep the previous palette on worker failure */
      })
      .finally(() => {
        if (extractRunRef.current === run) setExtracting(false)
      })
  }

  function reset() {
    requestRef.current += 1
    extractRunRef.current += 1
    discardLoaded()
    setSample(null)
    setPalette([])
    setPicked(null)
    setError(null)
    setCopiedIndex(null)
    setStage('idle')
    setSession((s) => s + 1)
  }

  /** Click on the preview → read the exact pixel from the full-resolution image. */
  async function pickFromPreview(e: React.MouseEvent<HTMLElement>) {
    if (!loaded || picking) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const relX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const relY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    setPicking(true)
    try {
      const bitmap = await createImageBitmap(loaded.file, { imageOrientation: 'from-image' })
      try {
        const x = Math.min(bitmap.width - 1, Math.floor(relX * bitmap.width))
        const y = Math.min(bitmap.height - 1, Math.floor(relY * bitmap.height))
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('Could not create a canvas context.')
        context.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1)
        const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data
        setPicked({ rgb: { r, g, b }, source: 'image' })
      } finally {
        bitmap.close()
      }
    } catch {
      // Fall back to the analysis bitmap so a click never silently does nothing.
      if (sample) {
        const x = Math.min(sample.width - 1, Math.floor(relX * sample.width))
        const y = Math.min(sample.height - 1, Math.floor(relY * sample.height))
        const i = (y * sample.width + x) * 4
        setPicked({
          rgb: { r: sample.data[i] ?? 0, g: sample.data[i + 1] ?? 0, b: sample.data[i + 2] ?? 0 },
          source: 'image',
        })
      }
    } finally {
      setPicking(false)
    }
  }

  async function pickFromScreen() {
    const Ctor = eyeDropperCtor()
    if (!Ctor) return
    try {
      const result = await new Ctor().open()
      setPicked({ rgb: hexToRgb(result.sRGBHex), source: 'screen' })
    } catch {
      /* user cancelled the system picker — leave the current pick alone */
    }
  }

  async function copySwatch(index: number, value: string) {
    if (await copyText(value)) {
      setCopiedIndex(index)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopiedIndex(null), 1500)
    }
  }

  function downloadCss() {
    downloadBlob(new Blob([buildPaletteCss(palette)], { type: 'text/css' }), 'palette.css')
  }

  const busy = stage === 'working'
  const pairs = suggestContrastPairs(palette)
  const eyeAvailable = typeof window !== 'undefined' && eyeDropperCtor() !== null
  const allText = buildPaletteText(palette, format)

  return (
    <ToolLayout
      title="Color palette extractor"
      description="Drop in any image to pull out its dominant colors, pick exact pixels, and find readable text/background pairs. Everything runs in your browser."
      badge="client-side"
    >
      {stage === 'idle' || stage === 'error' ? (
        <>
          <FileDropzone
            key={session}
            accept="image/*"
            onFiles={(files) => void openFile(files[0])}
            hint="One image at a time — PNG, JPEG, WebP, GIF or SVG"
          />
          {stage === 'error' && error && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-5">
          {busy && <ProgressBar label="Reading image…" className="max-w-md" />}

          {loaded && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={(e) => void pickFromPreview(e)}
                  title="Click to pick the exact pixel under your cursor"
                  aria-label="Pick a pixel from the image preview"
                  className="cursor-crosshair overflow-hidden rounded-lg border border-line"
                >
                  <img src={loaded.url} alt={loaded.file.name} className="h-28 w-28 object-cover" />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{loaded.file.name}</p>
                  <p className="font-mono text-[11px] text-muted tabular-nums">
                    {loaded.width}×{loaded.height} · {formatBytes(loaded.file.size)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    Click the thumbnail to pick an exact pixel
                    {eyeAvailable ? ', or use the screen eyedropper below' : ''}. Transparent pixels
                    are ignored.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1"
                    onClick={reset}
                    disabled={busy}
                  >
                    <RotateCcw className="size-3.5" />
                    Choose another
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-lg border border-line bg-card p-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <label className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-muted">Colors</span>
                    <input
                      type="range"
                      min={2}
                      max={10}
                      step={1}
                      value={colorCount}
                      onChange={(e) => changeCount(Number(e.target.value))}
                      aria-label="Number of palette colors"
                      className="w-36 accent-(--color-pine)"
                    />
                    <span className="w-4 font-mono text-xs text-ink tabular-nums">
                      {colorCount}
                    </span>
                  </label>
                  <div role="radiogroup" aria-label="Copy format" className="flex flex-wrap gap-1">
                    {(Object.keys(FORMAT_LABELS) as ColorFormat[]).map((id) => (
                      <button
                        key={id}
                        role="radio"
                        aria-checked={format === id}
                        onClick={() => setFormat(id)}
                        className={cx(
                          'cursor-pointer rounded-md px-3 py-1.5 font-mono text-xs font-semibold transition-colors',
                          format === id
                            ? 'bg-mint text-pine'
                            : 'text-muted hover:bg-soft hover:text-ink',
                        )}
                      >
                        {FORMAT_LABELS[id]}
                      </button>
                    ))}
                  </div>
                  {extracting && (
                    <span role="status" className="text-xs text-faint">
                      Updating…
                    </span>
                  )}
                </div>

                {palette.length === 0 ? (
                  <p role="status" className="text-sm text-faint">
                    {busy ? 'Extracting…' : 'No opaque pixels found in this image.'}
                  </p>
                ) : (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {palette.map((color, i) => {
                      const value = formatColor(color, format)
                      const text = bestTextOn(color.rgb)
                      return (
                        <li key={`${color.hex}-${i}`}>
                          <button
                            type="button"
                            onClick={() => void copySwatch(i, value)}
                            title={`Copy ${value}`}
                            aria-label={`Copy ${value}`}
                            className="flex w-full cursor-pointer flex-col overflow-hidden rounded-lg border border-line text-left transition-transform hover:-translate-y-0.5"
                          >
                            <span
                              className="flex h-20 items-end justify-between gap-1 p-2"
                              style={{ backgroundColor: color.hex, color: text }}
                            >
                              <span className="font-mono text-[11px] font-semibold break-all">
                                {value}
                              </span>
                              {copiedIndex === i && (
                                <span className="shrink-0 rounded px-1 font-mono text-[10px] font-semibold">
                                  Copied
                                </span>
                              )}
                            </span>
                            <span className="flex items-center justify-between gap-1 bg-soft px-2 py-1.5">
                              <span className="font-mono text-[10px] text-muted tabular-nums">
                                {Math.round(color.share * 100)}%
                              </span>
                              <span className="font-mono text-[10px] text-faint">{color.hex}</span>
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {palette.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyButton text={allText} label={`Copy all (${FORMAT_LABELS[format]})`} />
                    <Button variant="secondary" size="sm" onClick={downloadCss}>
                      <Download className="size-3.5" />
                      palette.css
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                    <Pipette className="size-3.5" />
                    Eyedropper
                  </h3>
                  {eyeAvailable && (
                    <Button variant="secondary" size="sm" onClick={() => void pickFromScreen()}>
                      <Pipette className="size-3.5" />
                      Pick from screen
                    </Button>
                  )}
                </div>
                {picking ? (
                  <ProgressBar label="Picking pixel…" className="max-w-xs" />
                ) : picked ? (
                  <div className="flex flex-wrap items-center gap-4">
                    <span
                      aria-hidden
                      className="size-14 shrink-0 rounded-lg border border-line"
                      style={{ backgroundColor: rgbToHexString(picked.rgb) }}
                    />
                    <dl className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-1">
                      {(
                        [
                          ['HEX', rgbToHexString(picked.rgb)],
                          ['RGB', formatRgb(picked.rgb)],
                          ['HSL', formatHsl(rgbToHsl(picked.rgb.r, picked.rgb.g, picked.rgb.b))],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="flex items-center gap-2">
                          <dt className="font-mono text-[10px] text-faint">{label}</dt>
                          <dd className="font-mono text-xs text-ink">{value}</dd>
                          <CopyButton text={value} label="" aria-label={`Copy ${value}`} />
                        </div>
                      ))}
                    </dl>
                    <p className="w-full text-[11px] text-faint">
                      {picked.source === 'image'
                        ? 'Read from the full-resolution original, not the preview.'
                        : 'Read from your screen via the system eyedropper.'}{' '}
                      Best text on it: {bestTextOn(picked.rgb) === '#ffffff' ? 'white' : 'black'} (
                      {contrastRatio(
                        picked.rgb,
                        bestTextOn(picked.rgb) === '#ffffff'
                          ? { r: 255, g: 255, b: 255 }
                          : { r: 0, g: 0, b: 0 },
                      )}
                      :1).
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-faint">
                    Click the image thumbnail above
                    {eyeAvailable ? ' or pick anywhere on your screen' : ''} to inspect a single
                    pixel exactly.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-4">
                <h3 className="text-xs font-semibold text-muted">
                  Readable pairs in this palette{' '}
                  <span className="font-normal text-faint">(WCAG contrast ≥ 3:1)</span>
                </h3>
                {pairs.length === 0 ? (
                  <p className="text-xs text-faint">
                    No pairs in this palette reach 3:1 — try more colors or a higher-contrast image.
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {pairs.map((pair) => (
                      <li
                        key={`${pair.foreground.hex}-${pair.background.hex}`}
                        className="flex items-center gap-3 overflow-hidden rounded-lg border border-line"
                      >
                        <span
                          className="flex h-12 w-20 shrink-0 items-center justify-center font-display text-lg font-semibold"
                          style={{
                            backgroundColor: pair.background.hex,
                            color: pair.foreground.hex,
                          }}
                          aria-hidden
                        >
                          Ag
                        </span>
                        <span className="min-w-0 flex-1 py-1">
                          <span className="block truncate font-mono text-[11px] text-ink">
                            {pair.foreground.hex} on {pair.background.hex}
                          </span>
                          <span className="font-mono text-[11px] text-muted tabular-nums">
                            {pair.ratio}:1 · {pair.level}
                          </span>
                        </span>
                        <span className="shrink-0 pr-2">
                          <CopyButton
                            text={`${pair.foreground.hex} on ${pair.background.hex} (${pair.ratio}:1)`}
                            label=""
                            aria-label={`Copy ${pair.foreground.hex} on ${pair.background.hex}`}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </ToolLayout>
  )
}
