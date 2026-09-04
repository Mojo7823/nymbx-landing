import { useEffect, useState } from 'react'
import createPica from 'pica'
import { Download, FileArchive, RotateCcw } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { formatBytes } from '../../lib/format'
import { downloadBlob, downloadZip } from '../../lib/download'
import {
  APPLE_TOUCH_SIZE,
  buildIco,
  buildManifest,
  buildSnippet,
  ICO_SIZES,
  OUTPUT_FILES,
  PNG_SIZES,
  squareCrop,
} from './favicon'

interface Generated {
  size: number
  blob: Blob
  url: string
}

interface FaviconSet {
  sourceName: string
  sourceDims: string
  wasCropped: boolean
  smallSource: boolean
  pngs: Generated[]
  ico: { blob: Blob; url: string }
}

const pica = createPica()

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG encoding failed.')
  return blob
}

async function buildSet(file: File): Promise<FaviconSet> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { x, y, edge, cropped } = squareCrop(bitmap.width, bitmap.height)
    const source = document.createElement('canvas')
    source.width = edge
    source.height = edge
    const sourceCtx = source.getContext('2d')
    if (!sourceCtx) throw new Error('Could not create a canvas context')
    sourceCtx.drawImage(bitmap, x, y, edge, edge, 0, 0, edge, edge)

    const sizes = [...new Set([...ICO_SIZES, ...PNG_SIZES])].sort((a, b) => a - b)
    const pngs: Generated[] = []
    for (const size of sizes) {
      const target = document.createElement('canvas')
      target.width = size
      target.height = size
      // Pica (also used by the resize tool) keeps tiny icons sharp.
      await pica.resize(source, target, { filter: 'mks2013' })
      const blob = await canvasToPngBlob(target)
      pngs.push({ size, blob, url: URL.createObjectURL(blob) })
    }
    const icoPngs = await Promise.all(
      ICO_SIZES.map(async (size) => {
        const found = pngs.find((p) => p.size === size)!
        return { size, png: new Uint8Array(await found.blob.arrayBuffer()) }
      }),
    )
    const icoBytes = buildIco(icoPngs)
    const icoBlob = new Blob([icoBytes.slice().buffer], { type: 'image/x-icon' })
    return {
      sourceName: file.name,
      sourceDims: `${bitmap.width}×${bitmap.height}`,
      wasCropped: cropped,
      smallSource: edge < 512,
      pngs,
      ico: { blob: icoBlob, url: URL.createObjectURL(icoBlob) },
    }
  } finally {
    bitmap.close()
  }
}

function pngFor(set: FaviconSet, size: number): Generated {
  const found = set.pngs.find((p) => p.size === size)
  if (!found) throw new Error(`Missing ${size}px output`)
  return found
}

export default function FaviconGenerator() {
  const [set, setSet] = useState<FaviconSet | null>(null)
  const [appName, setAppName] = useState('My App')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState(0)

  useEffect(
    () => () => {
      setSet((prev) => {
        if (prev) {
          for (const p of prev.pngs) URL.revokeObjectURL(p.url)
          URL.revokeObjectURL(prev.ico.url)
        }
        return prev
      })
    },
    [],
  )

  function discardSet(next: FaviconSet | null) {
    setSet((prev) => {
      if (prev) {
        for (const p of prev.pngs) URL.revokeObjectURL(p.url)
        URL.revokeObjectURL(prev.ico.url)
      }
      return next
    })
  }

  async function openFile(file: File | undefined) {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    try {
      discardSet(await buildSet(file))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not build favicons from this image.')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    discardSet(null)
    setError(null)
    setSession((s) => s + 1)
  }

  async function downloadZipBundle() {
    if (!set) return
    const manifest = buildManifest(appName)
    await downloadZip(
      [
        { name: OUTPUT_FILES.ico, data: new Uint8Array(await set.ico.blob.arrayBuffer()) },
        {
          name: OUTPUT_FILES.appleTouch,
          data: new Uint8Array(await pngFor(set, APPLE_TOUCH_SIZE).blob.arrayBuffer()),
        },
        {
          name: OUTPUT_FILES.icon192,
          data: new Uint8Array(await pngFor(set, 192).blob.arrayBuffer()),
        },
        {
          name: OUTPUT_FILES.icon512,
          data: new Uint8Array(await pngFor(set, 512).blob.arrayBuffer()),
        },
        { name: OUTPUT_FILES.manifest, data: manifest },
      ],
      'favicon-set.zip',
    )
  }

  const manifest = buildManifest(appName)
  const snippet = buildSnippet()

  return (
    <ToolLayout
      title="Favicon generator"
      description="Turn one image into a complete favicon set: multi-size .ico, Apple touch icon, PWA icons, webmanifest, and the HTML snippet. Everything runs in your browser."
      badge="client-side"
    >
      {!set && !busy && (
        <FileDropzone
          key={session}
          accept="image/*"
          onFiles={(files) => void openFile(files[0])}
          hint="One square-ish image — PNG, JPEG, SVG or WebP"
        />
      )}
      {busy && <ProgressBar label="Rendering icon sizes…" className="max-w-md" />}
      {error && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
          <Button variant="secondary" size="sm" onClick={reset}>
            <RotateCcw className="size-3.5" />
            Try another image
          </Button>
        </div>
      )}

      {set && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span>
              Source <strong className="text-ink">{set.sourceName}</strong> ({set.sourceDims})
            </span>
            {set.wasCropped && <span>Center-cropped to a square automatically.</span>}
            {set.smallSource && (
              <span>
                Smaller than 512px — larger icons are upscaled and may look soft. A 512px+ square
                source is ideal.
              </span>
            )}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
              <RotateCcw className="size-3.5" />
              Another image
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-line bg-card p-4">
              <h3 className="mb-1 text-xs font-semibold text-muted">favicon.ico</h3>
              <p className="mb-3 font-mono text-[11px] text-faint tabular-nums">
                16 · 32 · 48px · {formatBytes(set.ico.blob.size)}
              </p>
              <div className="mb-3 flex items-end gap-4">
                {[16, 32, 48].map((size) => (
                  <img
                    key={size}
                    src={pngFor(set, size).url}
                    alt={`${size} pixel favicon preview`}
                    width={size}
                    height={size}
                    className="rounded border border-line"
                    style={{ width: size, height: size }}
                  />
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadBlob(set.ico.blob, OUTPUT_FILES.ico)}
              >
                <Download className="size-3.5" />
                favicon.ico
              </Button>
            </div>

            {[APPLE_TOUCH_SIZE, 192, 512].map((size) => {
              const asset = pngFor(set, size)
              const label = size === APPLE_TOUCH_SIZE ? 'apple-touch-icon.png' : `icon-${size}.png`
              return (
                <div key={size} className="rounded-lg border border-line bg-card p-4">
                  <h3 className="mb-1 text-xs font-semibold text-muted">{label}</h3>
                  <p className="mb-3 font-mono text-[11px] text-faint tabular-nums">
                    {size}×{size}px · {formatBytes(asset.blob.size)}
                  </p>
                  <img
                    src={asset.url}
                    alt={`${label} preview`}
                    className="mb-3 size-16 rounded border border-line"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => downloadBlob(asset.blob, label)}
                  >
                    <Download className="size-3.5" />
                    {label}
                  </Button>
                </div>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="app-name" className="text-xs font-semibold text-muted">
                  site.webmanifest
                </label>
                <CopyButton text={manifest} />
              </div>
              <input
                id="app-name"
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="App name for the manifest"
                autoComplete="off"
                spellCheck={false}
                className="h-9 w-full rounded-md border border-line-strong bg-card px-2 text-xs text-ink placeholder:text-faint focus:border-pine focus:outline-none"
              />
              <pre className="overflow-auto rounded-lg border border-line bg-card p-3 font-mono text-[11px] leading-relaxed text-ink">
                {manifest}
              </pre>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadBlob(
                      new Blob([manifest], { type: 'application/manifest+json' }),
                      OUTPUT_FILES.manifest,
                    )
                  }
                >
                  <Download className="size-3.5" />
                  {OUTPUT_FILES.manifest}
                </Button>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted">HTML snippet</span>
                <CopyButton text={snippet} />
              </div>
              <pre className="overflow-auto rounded-lg border border-line bg-card p-3 font-mono text-[11px] leading-relaxed text-ink">
                {snippet}
              </pre>
              <p className="text-xs text-faint">
                Put these files at your site root — the paths above match the zip layout exactly.
              </p>
            </div>
          </div>

          <div>
            <Button onClick={() => void downloadZipBundle()}>
              <FileArchive className="size-4" />
              Download full set (.zip)
            </Button>
          </div>
        </div>
      )}
    </ToolLayout>
  )
}
