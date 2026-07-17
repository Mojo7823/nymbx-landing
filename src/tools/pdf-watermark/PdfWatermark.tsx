import { useEffect, useRef, useState } from 'react'
import { Download, ImageIcon, Stamp, Trash2, Type } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { parsePageRanges } from '../../lib/pageRanges'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { needsUnicodeFont, POSITION_PRESETS, type PositionPreset } from './placement'
import type { WatermarkOptions, WatermarkWorkerApi } from './watermark.worker'

interface LoadedPdf {
  name: string
  size: number
  bytes: Uint8Array
  pageCount: number
  firstPage: Uint8Array
}

interface StampImage {
  name: string
  bytes: Uint8Array
  type: 'png' | 'jpeg'
}

interface Controls {
  kind: 'text' | 'image'
  text: string
  fontSize: number
  scalePct: number
  opacity: number
  rotation: number
  preset: PositionPreset
  pageMode: 'all' | 'range'
  range: string
}

const DEFAULTS: Controls = {
  kind: 'text',
  text: 'CONFIDENTIAL',
  fontSize: 48,
  scalePct: 50,
  opacity: 30,
  rotation: 0,
  preset: 'center',
  pageMode: 'all',
  range: '',
}

const PRESET_LABELS: Record<PositionPreset, string> = {
  'top-left': 'Top left',
  'top-center': 'Top center',
  'top-right': 'Top right',
  'middle-left': 'Middle left',
  center: 'Center',
  'middle-right': 'Middle right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom center',
  'bottom-right': 'Bottom right',
}

async function renderPdfToCanvas(bytes: Uint8Array, canvas: HTMLCanvasElement): Promise<void> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const task = pdfjs.getDocument({ data: bytes.slice() })
  try {
    const doc = await task.promise
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = 520 / base.width
    const viewport = page.getViewport({ scale: scale * devicePixelRatio })
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
  } finally {
    void task.destroy()
  }
}

export default function PdfWatermark() {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [image, setImage] = useState<StampImage | null>(null)
  const [controls, setControls] = useState<Controls>(DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const workerRef = useRef<WorkerHandle<WatermarkWorkerApi> | null>(null)
  const fontRef = useRef<Uint8Array | null>(null)
  const previewSeq = useRef(0)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => workerRef.current?.terminate(), [])

  function getWorker() {
    workerRef.current ??= wrapWorker<WatermarkWorkerApi>(
      new Worker(new URL('./watermark.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current
  }

  function set<K extends keyof Controls>(key: K, value: Controls[K]) {
    setControls((prev) => ({ ...prev, [key]: value }))
  }

  const parsed = pdf
    ? controls.pageMode === 'all'
      ? { pages: [] }
      : parsePageRanges(controls.range, pdf.pageCount)
    : { pages: [] }

  async function buildOptions(pages: number[] | 'all'): Promise<WatermarkOptions> {
    let fontBytes: Uint8Array | null = null
    if (controls.kind === 'text' && needsUnicodeFont(controls.text)) {
      if (!fontRef.current) {
        const res = await fetch('/fonts/NotoSansTC-Regular.ttf')
        if (!res.ok) throw new Error('font')
        fontRef.current = new Uint8Array(await res.arrayBuffer())
      }
      fontBytes = fontRef.current
    }
    return {
      kind: controls.kind,
      text: controls.text,
      fontBytes,
      fontSize: controls.fontSize,
      imageBytes: image?.bytes ?? null,
      imageType: image?.type ?? 'png',
      scalePct: controls.scalePct,
      opacity: controls.opacity / 100,
      rotation: controls.rotation,
      preset: controls.preset,
      pages,
    }
  }

  const stampReady =
    (controls.kind === 'text' && controls.text.trim() !== '') ||
    (controls.kind === 'image' && image !== null)

  // ── Live preview on the first page, debounced ─────────────────────────
  const debounced = useDebouncedValue(controls, 350)
  const debouncedImage = useDebouncedValue(image, 350)
  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    const seq = ++previewSeq.current
    const ready =
      (debounced.kind === 'text' && debounced.text.trim() !== '') ||
      (debounced.kind === 'image' && debouncedImage !== null)
    setPreviewing(true)
    void (async () => {
      try {
        const bytes = ready
          ? await getWorker().api.watermark(pdf.firstPage, await buildOptions('all'))
          : pdf.firstPage
        if (seq !== previewSeq.current || !canvasRef.current) return
        await renderPdfToCanvas(bytes, canvasRef.current)
        if (seq === previewSeq.current) setError(null)
      } catch (err) {
        if (seq !== previewSeq.current) return
        setError(
          err instanceof Error && err.message === 'font'
            ? 'Could not load the bundled Unicode font for this text.'
            : 'Could not render the watermark preview — some characters may not be supported.',
        )
      } finally {
        if (seq === previewSeq.current) setPreviewing(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, debounced, debouncedImage])

  async function loadFile(files: File[]) {
    const file = files[0]
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const firstPage = await getWorker().api.extractFirstPage(bytes)
      // Page count via pdf-lib output is not available here; count with pdf.js.
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
      const task = pdfjs.getDocument({ data: bytes.slice() })
      const doc = await task.promise
      const pageCount = doc.numPages
      void task.destroy()
      setPdf({ name: file.name, size: file.size, bytes, pageCount, firstPage })
    } catch {
      setError(
        'Could not read this file as a PDF. It may be corrupted, password-protected, or not a PDF at all.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadImage(file: File | undefined) {
    if (!file) return
    const type = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpeg' : null
    if (!type) {
      setError('The stamp image must be a PNG or JPEG.')
      return
    }
    setError(null)
    setImage({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), type })
  }

  function reset() {
    previewSeq.current++
    setPdf(null)
    setError(null)
    setApplying(false)
    setPreviewing(false)
  }

  async function apply() {
    if (!pdf || applying || !stampReady) return
    const pages =
      controls.pageMode === 'all' ? ('all' as const) : parsed.pages.length > 0 ? parsed.pages : null
    if (!pages) return
    setError(null)
    setApplying(true)
    try {
      const data = await getWorker().api.watermark(pdf.bytes, await buildOptions(pages))
      const base = pdf.name.replace(/\.pdf$/i, '')
      downloadBlob(
        new Blob([data as BlobPart], { type: 'application/pdf' }),
        `${base}-watermarked.pdf`,
      )
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'font'
          ? 'Could not load the bundled Unicode font for this text.'
          : 'Applying the watermark failed — this PDF may use features pdf-lib cannot modify.',
      )
    } finally {
      setApplying(false)
    }
  }

  const rangeInvalid =
    controls.pageMode === 'range' && (!!parsed.error || parsed.pages.length === 0)

  return (
    <ToolLayout
      title="PDF watermark"
      description="Stamp text or an image across the pages of a PDF — set opacity, size, rotation and position, with a live preview. Everything stays in your browser."
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
              hint="One PDF — the first page becomes a live preview"
            />
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

          <div className="flex flex-col gap-6 lg:flex-row">
            {/* ── Controls ─────────────────────────────────────────────── */}
            <div className="flex w-full flex-col gap-4 rounded-lg border border-line bg-card p-4 lg:max-w-sm lg:self-start">
              <div role="tablist" aria-label="Watermark type" className="flex gap-1">
                {(
                  [
                    ['text', 'Text', Type],
                    ['image', 'Image', ImageIcon],
                  ] as const
                ).map(([k, label, Icon]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={controls.kind === k}
                    onClick={() => set('kind', k)}
                    className={cx(
                      'flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors',
                      controls.kind === k
                        ? 'border-pine bg-mint text-pine'
                        : 'border-line-strong bg-card text-muted hover:text-ink',
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {controls.kind === 'text' ? (
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted">Watermark text</span>
                  <input
                    type="text"
                    value={controls.text}
                    onChange={(e) => set('text', e.target.value)}
                    placeholder="CONFIDENTIAL"
                    className="h-9 rounded-md border border-line-strong bg-card px-2 text-sm text-ink focus:border-pine focus:outline-none"
                  />
                  <span className="text-[11px] text-muted">
                    CJK and other non-Latin text embeds our bundled Noto Sans TC font.
                  </span>
                </label>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted">Stamp image</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <ImageIcon className="size-3.5" />
                      {image ? 'Replace image' : 'Choose PNG / JPEG'}
                    </Button>
                    {image && <span className="truncate text-xs text-muted">{image.name}</span>}
                  </div>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    tabIndex={-1}
                    onChange={(e) => {
                      void loadImage(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </div>
              )}

              <label className="flex flex-col gap-1">
                <span className="flex justify-between text-xs font-medium text-muted">
                  {controls.kind === 'text' ? 'Font size' : 'Width (% of page)'}
                  <span className="font-mono tabular-nums">
                    {controls.kind === 'text' ? `${controls.fontSize} pt` : `${controls.scalePct}%`}
                  </span>
                </span>
                <input
                  type="range"
                  min={controls.kind === 'text' ? 8 : 5}
                  max={controls.kind === 'text' ? 144 : 100}
                  value={controls.kind === 'text' ? controls.fontSize : controls.scalePct}
                  onChange={(e) =>
                    set(controls.kind === 'text' ? 'fontSize' : 'scalePct', Number(e.target.value))
                  }
                  className="accent-(--color-pine)"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="flex justify-between text-xs font-medium text-muted">
                  Opacity
                  <span className="font-mono tabular-nums">{controls.opacity}%</span>
                </span>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={controls.opacity}
                  onChange={(e) => set('opacity', Number(e.target.value))}
                  className="accent-(--color-pine)"
                />
              </label>

              <div className="flex flex-col gap-1">
                <span className="flex justify-between text-xs font-medium text-muted">
                  Rotation
                  <span className="font-mono tabular-nums">{controls.rotation}°</span>
                </span>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  step={5}
                  value={controls.rotation}
                  onChange={(e) => set('rotation', Number(e.target.value))}
                  aria-label="Rotation"
                  className="accent-(--color-pine)"
                />
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => set('rotation', 0)}>
                    0°
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => set('rotation', 45)}>
                    Diagonal
                  </Button>
                </div>
              </div>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-xs font-medium text-muted">Position</legend>
                <div
                  className="grid w-fit grid-cols-3 gap-1"
                  role="radiogroup"
                  aria-label="Watermark position"
                >
                  {POSITION_PRESETS.map((p) => (
                    <button
                      key={p}
                      role="radio"
                      aria-checked={controls.preset === p}
                      aria-label={PRESET_LABELS[p]}
                      title={PRESET_LABELS[p]}
                      onClick={() => set('preset', p)}
                      className={cx(
                        'size-8 cursor-pointer rounded border transition-colors',
                        controls.preset === p
                          ? 'border-pine bg-mint'
                          : 'border-line-strong bg-card hover:border-pine/60',
                      )}
                    >
                      <span
                        className={cx(
                          'mx-auto block size-2 rounded-full',
                          controls.preset === p ? 'bg-pine' : 'bg-line-strong',
                        )}
                      />
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-xs font-medium text-muted">Pages</legend>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {(
                    [
                      ['all', 'All pages'],
                      ['range', 'Range'],
                    ] as const
                  ).map(([mode, label]) => (
                    <label
                      key={mode}
                      className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink"
                    >
                      <input
                        type="radio"
                        name="pageMode"
                        checked={controls.pageMode === mode}
                        onChange={() => set('pageMode', mode)}
                        className="size-3.5 accent-(--color-pine)"
                      />
                      {label}
                    </label>
                  ))}
                  {controls.pageMode === 'range' && (
                    <input
                      type="text"
                      value={controls.range}
                      onChange={(e) => set('range', e.target.value)}
                      placeholder={`e.g. 1-3,7  (of ${pdf.pageCount})`}
                      spellCheck={false}
                      aria-label="Page range"
                      className="h-8 min-w-0 flex-1 basis-40 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
                    />
                  )}
                </div>
                {controls.pageMode === 'range' && parsed.error && (
                  <p role="alert" className="font-mono text-xs text-red-600 dark:text-red-400">
                    {parsed.error}
                  </p>
                )}
              </fieldset>

              <div className="border-t border-line pt-4">
                <Button
                  onClick={() => void apply()}
                  disabled={applying || !stampReady || rangeInvalid}
                >
                  {applying ? (
                    'Applying…'
                  ) : (
                    <>
                      <Download className="size-4" />
                      Apply & download
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* ── Live preview ─────────────────────────────────────────── */}
            <div className="min-w-0 flex-1">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                <Stamp className="size-3.5" />
                Live preview — first page
                {previewing && <span className="text-faint">(updating…)</span>}
              </p>
              {error && (
                <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              <canvas
                ref={canvasRef}
                className="w-full max-w-lg rounded-lg border border-line bg-white shadow-sm"
                aria-label="Watermark preview of the first page"
              />
            </div>
          </div>
        </>
      )}
    </ToolLayout>
  )
}
