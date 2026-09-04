import { useEffect, useState } from 'react'
import exifr from 'exifr'
import { Download, Eraser, MapPin, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import {
  decimalToDms,
  formatTagValue,
  googleMapsUrl,
  hasExifSegment,
  ORIENTATION_LABELS,
  osmUrl,
  outputName,
} from './exif'
import {
  dataUrlToBytes,
  fileToDataUrl,
  stripJpeg,
  type StripMode,
  type StripOutcome,
} from './strip'

type Phase = 'idle' | 'reading' | 'ready' | 'working' | 'done' | 'error'

interface GpsInfo {
  latitude: number
  longitude: number
}

interface LoadedImage {
  file: File
  url: string
  width: number
  height: number
  groups: { title: string; rows: Array<[string, string]> }[]
  gps: GpsInfo | null
  orientation: number | null
  isJpeg: boolean
}

const MODE_LABELS: Record<StripMode, string> = {
  all: 'Strip everything',
  gps: 'Remove GPS only',
  'keep-orientation': 'Keep orientation only',
}

const MODE_BLURBS: Record<StripMode, string> = {
  all: 'Every metadata block goes. Pixel data is untouched.',
  gps: 'Only the location block is removed; all other tags stay byte-identical.',
  'keep-orientation':
    'Keeps the rotation tag so the photo still displays correctly; everything else goes.',
}

const GROUP_TITLES: Record<string, string> = {
  ifd0: 'Camera & file',
  exif: 'Exposure & lens',
  gps: 'GPS',
  interop: 'Interoperability',
  xmp: 'XMP',
  iptc: 'IPTC',
  ihdr: 'Image structure',
  jfif: 'JPEG structure',
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}

export default function ExifViewer() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [loaded, setLoaded] = useState<LoadedImage | null>(null)
  const [mode, setMode] = useState<StripMode>('all')
  const [outcome, setOutcome] = useState<(StripOutcome & { name: string; bytes: number }) | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [session, setSession] = useState(0)

  useEffect(
    () => () => {
      setLoaded((prev) => {
        if (prev) URL.revokeObjectURL(prev.url)
        return prev
      })
    },
    [],
  )

  async function openFile(file: File | undefined) {
    if (!file) return
    setPhase('reading')
    setError(null)
    setOutcome(null)
    setLoaded((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    try {
      const [tags, bitmap] = await Promise.all([
        exifr.parse(file, {
          // ifd0 cannot be disabled per exifr's types — it is always parsed.
          exif: true,
          gps: true,
          interop: true,
          ifd1: false,
          xmp: true,
          iptc: true,
          icc: false,
          mergeOutput: false,
        }) as Promise<Record<string, Record<string, unknown> | undefined> | undefined>,
        createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null),
      ])
      const groups = Object.entries(tags ?? {})
        .filter(([, rows]) => rows && Object.keys(rows).length > 0)
        .map(([key, rows]) => ({
          title: GROUP_TITLES[key] ?? key,
          rows: Object.entries(rows as Record<string, unknown>).map(
            ([name, value]) => [name, formatTagValue(value)] as [string, string],
          ),
        }))
      const gpsBlock = tags?.gps as { latitude?: unknown; longitude?: unknown } | undefined
      const gps =
        typeof gpsBlock?.latitude === 'number' && typeof gpsBlock?.longitude === 'number'
          ? { latitude: gpsBlock.latitude, longitude: gpsBlock.longitude }
          : null
      const orientationRaw = (tags?.ifd0 as { Orientation?: unknown } | undefined)?.Orientation
      setLoaded({
        file,
        url: URL.createObjectURL(file),
        width: bitmap?.width ?? 0,
        height: bitmap?.height ?? 0,
        groups,
        gps,
        orientation: typeof orientationRaw === 'number' ? orientationRaw : null,
        isJpeg: file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name),
      })
      bitmap?.close()
      setPhase('ready')
    } catch (cause) {
      setPhase('error')
      setError(cause instanceof Error ? cause.message : 'Could not read this image.')
    }
  }

  function reset() {
    setLoaded((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
    setOutcome(null)
    setError(null)
    setPhase('idle')
    setSession((s) => s + 1)
  }

  /** Re-encode path for PNG/WebP and for rotated JPEGs on "strip all". */
  async function reencodeClean(dataUrl: string, mime: string): Promise<string> {
    const blob = await dataUrlToBlob(dataUrl)
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    try {
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not create a canvas context')
      context.drawImage(bitmap, 0, 0)
      const out = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime === 'image/png' ? 'image/png' : 'image/jpeg', 0.95),
      )
      if (!out) throw new Error('Re-encoding failed.')
      return await fileToDataUrl(new File([out], 'reencoded', { type: out.type }))
    } finally {
      bitmap.close()
    }
  }

  async function strip() {
    if (!loaded || phase === 'working') return
    setPhase('working')
    setError(null)
    setActionError(null)
    setOutcome(null)
    try {
      const dataUrl = await fileToDataUrl(loaded.file)
      let result: StripOutcome
      if (loaded.isJpeg) {
        const bytes = dataUrlToBytes(dataUrl)
        if (!hasExifSegment(bytes) && mode !== 'all') {
          // Piexif needs an EXIF block to edit; nothing to do here.
          const empty =
            mode === 'gps'
              ? 'This file has no EXIF block, so there is no GPS tag to remove.'
              : 'This file has no EXIF block, so there is nothing to keep or remove.'
          setOutcome({
            dataUrl,
            removed: [empty],
            reencoded: false,
            name: outputName(loaded.file.name),
            bytes: loaded.file.size,
          })
          setPhase('done')
          return
        }
        result = await stripJpeg(dataUrl, mode, (url) =>
          reencodeClean(url, 'image/jpeg').then((clean) => clean),
        )
      } else {
        const mime = loaded.file.type === 'image/png' ? 'image/png' : 'image/jpeg'
        result = {
          dataUrl: await reencodeClean(dataUrl, mime),
          removed: [
            'all metadata (this format is re-encoded without metadata blocks)',
            ...(loaded.orientation && loaded.orientation !== 1
              ? ['rotation baked into pixels']
              : []),
          ],
          reencoded: true,
        }
      }
      const blob = await dataUrlToBlob(result.dataUrl)
      setOutcome({ ...result, name: outputName(loaded.file.name), bytes: blob.size })
      setPhase('done')
    } catch (cause) {
      setPhase('ready')
      setActionError(cause instanceof Error ? cause.message : 'Stripping failed.')
    }
  }

  const busy = phase === 'reading' || phase === 'working'

  return (
    <ToolLayout
      title="EXIF viewer & stripper"
      description="See everything your camera embedded — including GPS location — then strip it before sharing. All parsing and stripping happens in your browser."
      badge="client-side"
    >
      <div
        className="mb-6 flex items-start gap-2.5 rounded-lg border border-pine/25 bg-mint/30 px-3 py-2.5 text-xs text-pine"
        role="note"
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>
          Files never leave this device. Even map links below only open in your browser — nothing is
          uploaded to check them.
        </p>
      </div>

      {phase === 'idle' || phase === 'error' ? (
        <>
          <FileDropzone
            key={session}
            accept="image/*"
            onFiles={(files) => void openFile(files[0])}
            hint="One photo at a time — JPEG, PNG, WebP, …"
          />
          {phase === 'error' && error && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-5">
          {busy && (
            <ProgressBar
              label={phase === 'reading' ? 'Reading metadata…' : 'Stripping…'}
              className="max-w-md"
            />
          )}

          {loaded && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                <img
                  src={loaded.url}
                  alt={loaded.file.name}
                  className="h-24 w-24 rounded-lg border border-line object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{loaded.file.name}</p>
                  <p className="font-mono text-[11px] text-muted tabular-nums">
                    {loaded.width > 0 ? `${loaded.width}×${loaded.height} · ` : ''}
                    {formatBytes(loaded.file.size)}
                    {loaded.orientation !== null &&
                      loaded.orientation !== 1 &&
                      ` · rotation: ${ORIENTATION_LABELS[loaded.orientation] ?? loaded.orientation}`}
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

              {loaded.gps && (
                <div
                  className="flex flex-col gap-2 rounded-lg border border-amber-badge/40 bg-amber-soft p-4"
                  role="alert"
                >
                  <p className="flex items-start gap-1.5 text-sm font-semibold text-amber-badge">
                    <MapPin className="mt-0.5 size-4 shrink-0" />
                    This photo contains GPS coordinates — anyone you send it to can see where it was
                    taken.
                  </p>
                  <p className="font-mono text-xs text-amber-badge tabular-nums">
                    {decimalToDms(loaded.gps.latitude, true)},{' '}
                    {decimalToDms(loaded.gps.longitude, false)} ({loaded.gps.latitude},{' '}
                    {loaded.gps.longitude})
                  </p>
                  <p className="text-xs text-amber-badge">
                    <a
                      className="underline"
                      href={googleMapsUrl(loaded.gps.latitude, loaded.gps.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Google Maps
                    </a>{' '}
                    ·{' '}
                    <a
                      className="underline"
                      href={osmUrl(loaded.gps.latitude, loaded.gps.longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      OpenStreetMap
                    </a>
                  </p>
                </div>
              )}

              {loaded.groups.length === 0 ? (
                <p className="text-sm text-faint" role="status">
                  No metadata found in this file — there is nothing to strip.
                </p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {loaded.groups.map((group) => (
                    <div
                      key={group.title}
                      className="overflow-hidden rounded-lg border border-line"
                    >
                      <h3 className="border-b border-line bg-card px-3 py-2 text-xs font-semibold text-muted">
                        {group.title} · {group.rows.length} tag{group.rows.length === 1 ? '' : 's'}
                      </h3>
                      <dl className="max-h-64 overflow-auto px-3 py-2">
                        {group.rows.map(([name, value]) => (
                          <div
                            key={name}
                            className="flex gap-3 border-b border-line/50 py-1 last:border-0"
                          >
                            <dt
                              className="w-32 shrink-0 truncate font-mono text-[11px] text-muted"
                              title={name}
                            >
                              {name}
                            </dt>
                            <dd className="min-w-0 flex-1 break-all font-mono text-[11px] text-ink">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <span className="text-xs font-semibold text-muted">Strip mode</span>
                  <div role="radiogroup" aria-label="Strip mode" className="flex flex-wrap gap-1">
                    {(Object.keys(MODE_LABELS) as StripMode[]).map((id) => (
                      <button
                        key={id}
                        role="radio"
                        aria-checked={mode === id}
                        onClick={() => setMode(id)}
                        className={cx(
                          'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                          mode === id
                            ? 'bg-mint text-pine'
                            : 'text-muted hover:bg-soft hover:text-ink',
                        )}
                      >
                        {MODE_LABELS[id]}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-faint">
                  {MODE_BLURBS[mode]}{' '}
                  {!loaded.isJpeg && 'PNG/WebP outputs are re-encoded without metadata blocks.'}{' '}
                  {loaded.isJpeg &&
                    mode === 'all' &&
                    loaded.orientation !== null &&
                    loaded.orientation !== 1 &&
                    'This photo uses EXIF rotation, so stripping everything re-encodes it with the rotation baked in.'}
                </p>
                <div>
                  <Button onClick={() => void strip()} disabled={busy}>
                    <Eraser className="size-4" />
                    {busy ? 'Working…' : 'Strip and download'}
                  </Button>
                </div>
                {actionError && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                    {actionError}
                  </p>
                )}
                {outcome && phase === 'done' && (
                  <div className="flex flex-col gap-2 rounded-lg border border-pine/25 bg-mint/30 px-3 py-2.5">
                    <p className="text-xs font-semibold text-pine">
                      Cleaned {formatBytes(loaded.file.size)} → {formatBytes(outcome.bytes)}
                      {outcome.reencoded ? ' (re-encoded)' : ' (original bytes untouched)'}
                    </p>
                    <ul className="list-disc pl-5 text-xs text-pine">
                      {outcome.removed.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void dataUrlToBlob(outcome.dataUrl).then((blob) =>
                            downloadBlob(blob, outcome.name),
                          )
                        }
                      >
                        <Download className="size-3.5" />
                        Download {outcome.name}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {loaded.groups.length > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-faint">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  Stripping removes information permanently from the download — your original file
                  is never modified.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </ToolLayout>
  )
}
