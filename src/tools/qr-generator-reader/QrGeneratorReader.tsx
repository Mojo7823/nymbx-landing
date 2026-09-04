import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  Camera,
  Download,
  QrCode,
  ScanLine,
  Sparkles,
  Trash2,
  TriangleAlert,
  VideoOff,
} from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import {
  buildWifiPayload,
  EC_LABELS,
  parseWifiPayload,
  validatePayload,
  type EcLevel,
  type QrFormat,
  type WifiEncryption,
} from './qr'
import { decodeImageData, decodeImageFile, type DecodedCode } from './decode'

type Tab = 'generate' | 'read'

const FORMAT_LABELS: Record<QrFormat, string> = { text: 'Text', url: 'URL', wifi: 'Wi-Fi' }
const EC_LEVELS: EcLevel[] = ['L', 'M', 'Q', 'H']
const WIFI_ENCRYPTIONS: WifiEncryption[] = ['WPA', 'WEP', 'nopass']
const WIFI_ENCRYPTION_LABELS: Record<WifiEncryption, string> = {
  WPA: 'WPA / WPA2',
  WEP: 'WEP',
  nopass: 'Open network',
}
const SAMPLE = 'https://nymbx.dev/tools/qr-generator-reader'

function Tabs<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  labels: Record<T, string>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option}
          role="tab"
          aria-selected={value === option}
          onClick={() => onChange(option)}
          className={cx(
            'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
            value === option ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((response) => response.blob())
}

function DecodedList({ codes }: { codes: DecodedCode[] }) {
  if (codes.length === 0) {
    return (
      <p role="status" className="text-sm text-faint">
        No QR code found in this image. Try a sharper photo, or move closer so the code fills more
        of the frame.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-3">
      {codes.map((code, i) => {
        const wifi = parseWifiPayload(code.text)
        return (
          <li key={`${code.format}-${i}`} className="rounded-lg border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] tracking-wide text-faint uppercase">
                {code.format} · code {codes.length > 1 ? i + 1 : 1}
              </span>
              <CopyButton text={code.text} />
            </div>
            {wifi ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted">Network</dt>
                <dd className="font-mono text-xs break-all text-ink">{wifi.ssid}</dd>
                <dt className="text-muted">Security</dt>
                <dd className="text-ink">{wifi.encryption}</dd>
                <dt className="text-muted">Details</dt>
                <dd className="text-ink">
                  {wifi.hasPassword ? 'Password protected' : 'Open network'}
                  {wifi.hidden ? ' · hidden SSID' : ''}
                </dd>
              </dl>
            ) : (
              <p className="mt-1 text-sm break-all whitespace-pre-wrap text-ink">{code.text}</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default function QrGeneratorReader() {
  const [tab, setTab] = useState<Tab>('generate')

  // ── Generate state ──────────────────────────────────────────────
  const [format, setFormat] = useState<QrFormat>('text')
  const [text, setText] = useState('')
  const [ssid, setSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [encryption, setEncryption] = useState<WifiEncryption>('WPA')
  const [hiddenSsid, setHiddenSsid] = useState(false)
  const [ecLevel, setEcLevel] = useState<EcLevel>('M')
  const [pixelSize, setPixelSize] = useState(1024)
  const [svgUrl, setSvgUrl] = useState<string | null>(null)
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  const [genError, setGenError] = useState<string | null>(null)

  const payload =
    format === 'wifi'
      ? buildWifiPayload({ ssid, password: wifiPassword, encryption, hidden: hiddenSsid })
      : text
  const debouncedPayload = useDebouncedValue(payload, 250)
  const notice = validatePayload(
    format === 'wifi' ? (ssid === '' ? '' : debouncedPayload) : debouncedPayload,
    format,
  )
  const blocked = notice?.level === 'error'

  useEffect(() => {
    let stale = false
    let url: string | null = null
    async function render() {
      setSvgUrl(null)
      setPngUrl(null)
      if (blocked || debouncedPayload === '') {
        setGenError(null)
        return
      }
      try {
        const [svg, png] = await Promise.all([
          QRCode.toString(debouncedPayload, {
            type: 'svg',
            errorCorrectionLevel: ecLevel,
            margin: 4,
          }),
          QRCode.toDataURL(debouncedPayload, {
            errorCorrectionLevel: ecLevel,
            margin: 4,
            width: pixelSize,
          }),
        ])
        if (stale) return
        url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
        setSvgUrl(url)
        setPngUrl(png)
        setGenError(null)
      } catch (cause) {
        if (!stale)
          setGenError(cause instanceof Error ? cause.message : 'Could not draw this code.')
      }
    }
    void render()
    return () => {
      stale = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [debouncedPayload, ecLevel, pixelSize, blocked])

  async function downloadPng() {
    if (!pngUrl) return
    downloadBlob(await dataUrlToBlob(pngUrl), 'qr-code.png')
  }

  async function downloadSvg() {
    if (!svgUrl) return
    downloadBlob(await dataUrlToBlob(svgUrl), 'qr-code.svg')
  }

  // ── Read state ──────────────────────────────────────────────────
  const [codes, setCodes] = useState<DecodedCode[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  function switchTab(next: Tab) {
    // Effects may not stop the camera (set-state-in-effect), so do it here.
    if (next !== 'read') stopCamera()
    setTab(next)
  }

  async function scanFile(file: File | undefined) {
    if (!file || scanning) return
    setScanning(true)
    setScanError(null)
    setCodes(null)
    try {
      setCodes(await decodeImageFile(file))
    } catch (cause) {
      setScanError(cause instanceof Error ? cause.message : 'Could not read this image.')
    } finally {
      setScanning(false)
    }
  }

  async function startCamera() {
    setCameraError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('This browser cannot access the camera. Drop an image above instead.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      setCameraOn(true)
    } catch {
      setCameraError(
        'Camera is blocked or unavailable. Allow access in the browser prompt, or drop an image above instead.',
      )
    }
  }

  async function captureFrame() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || scanning) return
    setScanning(true)
    setScanError(null)
    setCodes(null)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Canvas 2D is not available in this browser.')
      context.drawImage(video, 0, 0)
      const frame = context.getImageData(0, 0, canvas.width, canvas.height)
      setCodes(await decodeImageData(frame))
    } catch (cause) {
      setScanError(cause instanceof Error ? cause.message : 'Could not read this frame.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <ToolLayout
      title="QR generator + reader"
      description="Create QR codes for text, links, or Wi-Fi credentials, and scan codes back from images or your camera. Everything runs in your browser; nothing is uploaded."
      badge="client-side"
    >
      <div className="mb-6">
        <Tabs
          label="Tool mode"
          options={['generate', 'read'] as const}
          labels={{ generate: 'Generate', read: 'Read / scan' }}
          value={tab}
          onChange={switchTab}
        />
      </div>

      {tab === 'generate' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <Tabs
              label="Payload format"
              options={['text', 'url', 'wifi'] as const}
              labels={FORMAT_LABELS}
              value={format}
              onChange={setFormat}
            />

            {format === 'wifi' ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="qr-ssid" className="text-xs font-semibold text-muted">
                    Network name (SSID)
                  </label>
                  <input
                    id="qr-ssid"
                    type="text"
                    value={ssid}
                    onChange={(e) => setSsid(e.target.value)}
                    placeholder="e.g. HomeWiFi"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 w-full rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink placeholder:font-sans placeholder:text-faint focus:border-pine focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="qr-wifi-key" className="text-xs font-semibold text-muted">
                    Password
                  </label>
                  <input
                    id="qr-wifi-key"
                    type="text"
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    placeholder={
                      encryption === 'nopass' ? 'Not needed for open networks' : 'Network password'
                    }
                    disabled={encryption === 'nopass'}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-9 w-full rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink placeholder:font-sans placeholder:text-faint focus:border-pine focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <span className="font-semibold">Security</span>
                    <select
                      value={encryption}
                      onChange={(e) => setEncryption(e.target.value as WifiEncryption)}
                      className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
                    >
                      {WIFI_ENCRYPTIONS.map((w) => (
                        <option key={w} value={w}>
                          {WIFI_ENCRYPTION_LABELS[w]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={hiddenSsid}
                      onChange={(e) => setHiddenSsid(e.target.checked)}
                      className="size-3.5 accent-pine"
                    />
                    Hidden network
                  </label>
                </div>
                <p className="rounded-md border border-line bg-card px-3 py-2 font-mono text-[11px] break-all text-faint">
                  {ssid === '' ? 'The Wi-Fi payload preview appears here.' : payload}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor="qr-text" className="text-xs font-semibold text-muted">
                  {format === 'url' ? 'Link' : 'Text'}
                </label>
                <textarea
                  id="qr-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    format === 'url' ? 'https://example.com/…' : 'Anything worth a QR code…'
                  }
                  spellCheck={false}
                  className="h-32 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:font-sans placeholder:text-faint focus:border-pine focus:outline-none"
                />
                <div>
                  <Button variant="ghost" size="sm" onClick={() => setText(SAMPLE)}>
                    <Sparkles className="size-3.5" />
                    Load sample
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                <span className="font-semibold">Error correction</span>
                <select
                  value={ecLevel}
                  onChange={(e) => setEcLevel(e.target.value as EcLevel)}
                  className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
                >
                  {EC_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {EC_LABELS[level]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <span className="font-semibold">Size</span>
                <input
                  type="range"
                  min={256}
                  max={2048}
                  step={64}
                  value={pixelSize}
                  onChange={(e) => setPixelSize(Number(e.target.value))}
                  className="w-32 accent-pine"
                />
                <span className="font-mono tabular-nums">{pixelSize}px</span>
              </label>
            </div>

            {notice && (
              <p
                role={notice.level === 'error' ? 'alert' : 'status'}
                className={cx(
                  'flex items-start gap-1.5 text-xs',
                  notice.level === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-badge',
                )}
              >
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {notice.message}
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col items-center gap-3">
            {svgUrl ? (
              <>
                <img
                  src={svgUrl}
                  alt="Generated QR code"
                  width={Math.min(pixelSize, 512)}
                  height={Math.min(pixelSize, 512)}
                  className="h-auto w-full max-w-80 rounded-lg border border-line bg-white p-3"
                />
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={() => void downloadPng()}>
                    <Download className="size-3.5" />
                    PNG · {pixelSize}px
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void downloadSvg()}>
                    <Download className="size-3.5" />
                    SVG
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex w-full max-w-80 flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong px-6 py-16 text-center">
                <QrCode className="size-8 text-faint" />
                <p className="text-sm text-faint">
                  {genError ?? 'Your code appears here as you type.'}
                </p>
              </div>
            )}
            {genError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {genError}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted">Scan an image file</span>
            <FileDropzone
              accept="image/*"
              onFiles={(files) => void scanFile(files[0])}
              hint="A photo or screenshot containing a QR code"
            />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Camera className="size-4 text-muted" />
              <span className="text-xs font-semibold text-muted">Live camera scan</span>
              {!cameraOn ? (
                <Button variant="secondary" size="sm" onClick={() => void startCamera()}>
                  <Camera className="size-3.5" />
                  Start camera
                </Button>
              ) : (
                <>
                  <Button size="sm" onClick={() => void captureFrame()} disabled={scanning}>
                    <ScanLine className="size-3.5" />
                    {scanning ? 'Reading…' : 'Capture & decode'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={stopCamera}>
                    <VideoOff className="size-3.5" />
                    Stop
                  </Button>
                </>
              )}
            </div>
            {cameraError && (
              <p role="alert" className="text-xs text-amber-badge">
                {cameraError}
              </p>
            )}
            {cameraOn && (
              <video
                ref={videoRef}
                playsInline
                muted
                className="max-h-80 w-full rounded-md bg-black object-contain"
              />
            )}
            <p className="text-xs text-faint">
              The camera feed stays on this device — frames are decoded locally, never uploaded.
            </p>
          </div>

          {scanning && <ProgressBar label="Reading code…" className="max-w-md" />}
          {scanError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {scanError}
            </p>
          )}
          {codes && !scanning && <DecodedList codes={codes} />}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCodes(null)
                setScanError(null)
              }}
            >
              <Trash2 className="size-3.5" />
              Clear result
            </Button>
            {codes && codes.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <CopyButton text={codes.map((c) => c.text).join('\n')} />
                <span className="text-xs text-muted">Copy all</span>
              </span>
            )}
          </div>
        </div>
      )}
    </ToolLayout>
  )
}
