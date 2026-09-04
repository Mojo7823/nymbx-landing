import { useMemo, useState } from 'react'
import { Download, Sparkles } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { defaultOptions, optimizeSvg, savingsPercent } from './svg'

const SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
  <!-- A verbose, editor-style export: comments, indentation, long decimals -->
  <defs>
    <linearGradient id="heroGradient" x1="0.000000" y1="0.000000" x2="1.000000" y2="0.000000">
      <stop offset="0.000000" stop-color="#34d399"/>
      <stop offset="1.000000" stop-color="#0d9488"/>
    </linearGradient>
  </defs>
  <rect x="10.123456" y="10.123456" width="220.000000" height="100.000000" rx="12.500000" fill="url(#heroGradient)"/>
  <circle cx="60.123456" cy="60.123456" r="24.000000" fill="#ffffff" fill-opacity="0.850000"/>
  <text x="120.000000" y="66.500000" font-family="sans-serif" font-size="20.000000" text-anchor="middle" fill="#ffffff">Hello SVG</text>
</svg>
`

function svgDataUrl(markup: string | null): string | null {
  if (markup === null) return null
  // Data URLs need no object-URL lifecycle and cannot execute scripts in
  // an <img> context, so previews stay side-effect free.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

export default function SvgOptimizer() {
  const [input, setInput] = useState('')
  const [fileName, setFileName] = useState('optimized.svg')
  const [keepViewBox, setKeepViewBox] = useState(() => defaultOptions().keepViewBox)
  const [keepIds, setKeepIds] = useState(() => defaultOptions().keepIds)
  const [precision, setPrecision] = useState(() => defaultOptions().precision)
  const [fileError, setFileError] = useState<string | null>(null)

  const debounced = useDebouncedValue(input, 300)
  const { result, optimizeError } = useMemo(() => {
    if (debounced.trim() === '') return { result: null, optimizeError: null }
    try {
      return {
        result: optimizeSvg(debounced, { keepViewBox, keepIds, precision }),
        optimizeError: null,
      }
    } catch (cause) {
      return {
        result: null,
        optimizeError: cause instanceof Error ? cause.message : 'Optimization failed.',
      }
    }
  }, [debounced, keepViewBox, keepIds, precision])
  const error = fileError ?? optimizeError

  const beforeUrl = svgDataUrl(debounced.trim() === '' ? null : debounced)
  const afterUrl = svgDataUrl(result?.data ?? null)
  const savings = result ? savingsPercent(result.inputBytes, result.outputBytes) : 0

  async function openFile(file: File | undefined) {
    if (!file) return
    setFileError(null)
    try {
      const text = await file.text()
      setInput(text)
      setFileName(file.name.replace(/\.svg$/i, '') || 'optimized')
    } catch {
      setFileError('Could not read this file.')
    }
  }

  return (
    <ToolLayout
      title="SVG optimizer"
      description="Minify SVG safely: smaller files that render exactly the same. Everything runs in your browser."
      badge="client-side"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between">
            <label htmlFor="svg-input" className="text-xs font-semibold text-muted">
              SVG markup
            </label>
            <Button variant="ghost" size="sm" onClick={() => setInput(SAMPLE)}>
              <Sparkles className="size-3.5" />
              Load sample
            </Button>
          </div>
          <textarea
            id="svg-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="<svg …> Paste markup here, or drop an .svg file below…"
            spellCheck={false}
            className="h-56 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:font-sans placeholder:text-faint focus:border-pine focus:outline-none"
          />
          <FileDropzone
            accept=".svg,image/svg+xml"
            onFiles={(files) => void openFile(files[0])}
            hint="…or drop an .svg file"
          />

          <div className="flex flex-col gap-3 rounded-lg border border-line bg-card p-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={keepViewBox}
                onChange={(e) => setKeepViewBox(e.target.checked)}
                className="size-3.5 accent-pine"
              />
              <span>
                <strong className="font-semibold text-ink">Keep viewBox</strong> — required for
                responsive scaling; uncheck for a few extra bytes
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={keepIds}
                onChange={(e) => setKeepIds(e.target.checked)}
                className="size-3.5 accent-pine"
              />
              <span>
                <strong className="font-semibold text-ink">Keep element IDs</strong> — safest when
                the SVG is styled or scripted from outside
              </span>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              <span className="font-semibold">Coordinate precision</span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={precision}
                onChange={(e) => setPrecision(Number(e.target.value))}
                className="w-32 accent-pine"
                aria-label="Coordinate precision in decimal places"
              />
              <span className="font-mono tabular-nums">{precision} dp</span>
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {result ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted tabular-nums">
                  {formatBytes(result.inputBytes)} → {formatBytes(result.outputBytes)} (
                  {savings >= 0 ? '−' : '+'}
                  {Math.abs(savings)}%)
                </span>
                <span className="ml-auto" />
                <CopyButton text={result.data} />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadBlob(
                      new Blob([result.data], { type: 'image/svg+xml' }),
                      `${fileName.replace(/\.svg$/i, '')}-optimized.svg`,
                    )
                  }
                >
                  <Download className="size-3.5" />
                  Download .svg
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <figure className="min-w-0">
                  <figcaption className="mb-1.5 text-xs font-semibold text-muted">
                    Before
                  </figcaption>
                  <div className="flex min-h-40 items-center justify-center rounded-lg border border-line bg-card p-3">
                    {beforeUrl && (
                      <img
                        src={beforeUrl}
                        alt="Original SVG render"
                        className="max-h-64 w-auto max-w-full"
                      />
                    )}
                  </div>
                </figure>
                <figure className="min-w-0">
                  <figcaption className="mb-1.5 text-xs font-semibold text-muted">After</figcaption>
                  <div className="flex min-h-40 items-center justify-center rounded-lg border border-line bg-card p-3">
                    {afterUrl && (
                      <img
                        src={afterUrl}
                        alt="Optimized SVG render"
                        className="max-h-64 w-auto max-w-full"
                      />
                    )}
                  </div>
                </figure>
              </div>
              <details className="rounded-lg border border-line bg-card">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-muted">
                  Optimized markup
                </summary>
                <pre className="max-h-64 overflow-auto border-t border-line p-3 font-mono text-[11px] break-all whitespace-pre-wrap text-ink">
                  {result.data}
                </pre>
              </details>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong px-6 py-16 text-center">
              <p className="text-sm text-faint">
                {error ?? 'The optimized SVG, size delta, and a before/after render appear here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </ToolLayout>
  )
}
