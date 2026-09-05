import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardPaste, Download, RotateCw, X } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { SplitPane } from '../../components/SplitPane'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import { toast } from '../../lib/toast'
import { formatBytes } from '../../lib/format'
import { getSetting, setSetting, type SettingsSchema } from '../../lib/settings'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import type { TurndownOptions } from '../../lib/htmlToMarkdown'
import { createRenderer, renderMarkdown } from '../markdown-renderer/renderMarkdown'
import { ConvertCancelled, convertHtml } from './convert'
import { byteLength, formatStatsLine, type DomCounts } from './stats'
import '../markdown-renderer/preview.css'

type Options = SettingsSchema['htmlToMarkdownOptions']

const DEFAULT_OPTIONS: Options = {
  headingStyle: 'atx',
  bulletListMarker: '-',
  fence: '```',
  emDelimiter: '_',
  images: 'keep',
  links: 'keep',
  skipChrome: true,
  baseUrl: '',
}

/** Above this the textarea shows a read-only head; conversion still uses it all. */
const EDITOR_LIMIT = 200 * 1024
const MAX_FILE_SIZE = 20 * 1024 * 1024

const ACCEPT = '.html,.htm,.xhtml,text/html,application/xhtml+xml'

/**
 * The preview must not reach the network: an `<img src="https://…">` from the
 * converted page would tell that host the user is looking at it (and is blocked
 * by COEP in production anyway). Replace every non-`data:` image with a chip
 * naming it. Input is DOMPurify output; re-serializing it introduces nothing.
 */
function neutralizeImages(sanitized: string): string {
  const doc = new DOMParser().parseFromString(sanitized, 'text/html')
  for (const img of doc.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? ''
    if (src.startsWith('data:')) continue
    const chip = doc.createElement('span')
    chip.className =
      'inline-flex max-w-full items-baseline gap-1 truncate rounded border border-line-strong bg-soft px-1.5 py-0.5 font-mono text-[11px] text-muted'
    chip.textContent = `image: ${img.getAttribute('alt') || src}`
    chip.title = src
    img.replaceWith(chip)
  }
  return doc.body.innerHTML
}

/**
 * Identifies one conversion run. Results, failures and progress carry the run
 * they belong to, so "is a conversion in flight?" is derived from state rather
 * than tracked by a setState inside the effect (which would cascade renders).
 */
interface RunKey {
  source: string
  optionsKey: string
  runId: number
}

function sameRun(a: RunKey | null, b: RunKey): boolean {
  return a !== null && a.source === b.source && a.optionsKey === b.optionsKey && a.runId === b.runId
}

interface Result extends RunKey {
  markdown: string
  counts: DomCounts
  htmlBytes: number
}

interface Failure extends RunKey {
  /** `null` means the user cancelled; the previous result stays on screen. */
  message: string | null
}

interface Progress extends RunKey {
  done: number
  total: number
}

const selectClasses =
  'cursor-pointer rounded-md border border-line-strong bg-card px-2 py-1 text-xs font-medium text-ink focus:border-pine focus:outline-none'

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (value: T) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={selectClasses}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function HtmlToMarkdown() {
  const [html, setHtml] = useState('')
  const [sourceName, setSourceName] = useState<string | null>(null)
  const [options, setOptions] = useState<Options>(DEFAULT_OPTIONS)
  const [result, setResult] = useState<Result | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [view, setView] = useState<'markdown' | 'preview'>('markdown')
  const [runId, setRunId] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const debouncedHtml = useDebouncedValue(html, 250)

  // Restore persisted preferences (options only — never the document).
  useEffect(() => {
    let active = true
    getSetting('htmlToMarkdownOptions')
      .then((saved) => {
        if (active && saved) setOptions({ ...DEFAULT_OPTIONS, ...saved })
      })
      .catch(() => {
        // Preferences are a convenience; defaults are fine.
      })
    return () => {
      active = false
    }
  }, [])

  function updateOptions(patch: Partial<Options>) {
    setOptions((prev) => {
      const next = { ...prev, ...patch }
      void setSetting('htmlToMarkdownOptions', next).catch(() => {
        // Persisting preferences is best-effort.
      })
      return next
    })
  }

  const turndownOptions = useMemo<TurndownOptions>(
    () => ({
      headingStyle: options.headingStyle,
      bulletListMarker: options.bulletListMarker,
      fence: options.fence,
      emDelimiter: options.emDelimiter,
      images: options.images,
      links: options.links,
      skipChrome: options.skipChrome,
      baseUrl: options.baseUrl.trim() || undefined,
      strikethrough: 'double',
    }),
    [options],
  )

  const optionsKey = useMemo(() => JSON.stringify(turndownOptions), [turndownOptions])
  const run = useMemo<RunKey>(
    () => ({ source: debouncedHtml, optionsKey, runId }),
    [debouncedHtml, optionsKey, runId],
  )

  const hasInput = debouncedHtml.trim() !== ''
  const currentResult = sameRun(result, run) ? result : null
  const currentFailure = sameRun(failure, run) ? failure : null
  const converting = hasInput && currentResult === null && currentFailure === null
  const percent = sameRun(progress, run) ? Math.round((progress!.done / progress!.total) * 100) : 0

  useEffect(() => {
    if (!hasInput) return
    let stale = false
    const controller = new AbortController()
    abortRef.current = controller
    convertHtml(
      run.source,
      turndownOptions,
      ({ done, total }) => {
        if (!stale) setProgress({ ...run, done, total })
      },
      controller.signal,
    )
      .then(({ markdown, counts }) => {
        if (!stale) setResult({ ...run, markdown, counts, htmlBytes: byteLength(run.source) })
      })
      .catch((err: unknown) => {
        if (stale) return
        // A cancelled run keeps the previous result visible.
        if (err instanceof ConvertCancelled) setFailure({ ...run, message: null })
        else
          setFailure({ ...run, message: err instanceof Error ? err.message : 'Conversion failed.' })
      })
    return () => {
      stale = true
      controller.abort()
    }
  }, [hasInput, run, turndownOptions])

  // The last successful result stays visible while a new run is in flight.
  const shownResult = hasInput ? result : null

  const md = useMemo(() => createRenderer(), [])
  const previewHtml = useMemo(
    () =>
      view === 'preview' && shownResult
        ? neutralizeImages(renderMarkdown(md, shownResult.markdown))
        : '',
    [md, view, shownResult],
  )

  async function loadFile(files: File[]) {
    const file = files[0]
    if (!file) return
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
    if (head.includes(0)) {
      toast('This does not look like an HTML file', { variant: 'error' })
      return
    }
    setSourceName(file.name)
    setHtml(await file.text())
  }

  function clearAll() {
    setHtml('')
    setSourceName(null)
    setResult(null)
    setFailure(null)
    setProgress(null)
  }

  async function pasteFromClipboard() {
    try {
      setSourceName(null)
      setHtml(await navigator.clipboard.readText())
    } catch {
      toast('Clipboard access was blocked. Paste into the text box instead.', { variant: 'error' })
    }
  }

  function download() {
    if (!shownResult) return
    const base = sourceName ? sourceName.replace(/\.(x?html?)$/i, '') : 'converted'
    downloadBlob(new Blob([shownResult.markdown], { type: 'text/markdown' }), `${base}.md`)
  }

  const truncatedEditor = html.length > EDITOR_LIMIT
  const editorValue = truncatedEditor ? html.slice(0, EDITOR_LIMIT) : html

  return (
    <ToolLayout
      title="HTML → Markdown"
      description="Turn any HTML page or snippet into clean Markdown, in your browser"
      badge="client-side"
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-card p-3">
        <Select
          label="Headings"
          value={options.headingStyle}
          options={
            [
              ['atx', 'ATX (#)'],
              ['setext', 'Setext'],
            ] as const
          }
          onChange={(headingStyle) => updateOptions({ headingStyle })}
        />
        <Select
          label="Bullet"
          value={options.bulletListMarker}
          options={
            [
              ['-', '-'],
              ['*', '*'],
              ['+', '+'],
            ] as const
          }
          onChange={(bulletListMarker) => updateOptions({ bulletListMarker })}
        />
        <Select
          label="Fence"
          value={options.fence}
          options={
            [
              ['```', '```'],
              ['~~~', '~~~'],
            ] as const
          }
          onChange={(fence) => updateOptions({ fence })}
        />
        <Select
          label="Emphasis"
          value={options.emDelimiter}
          options={
            [
              ['_', '_italic_'],
              ['*', '*italic*'],
            ] as const
          }
          onChange={(emDelimiter) => updateOptions({ emDelimiter })}
        />
        <Select
          label="Images"
          value={options.images}
          options={
            [
              ['keep', 'Keep'],
              ['alt', 'Alt text only'],
              ['drop', 'Drop'],
            ] as const
          }
          onChange={(images) => updateOptions({ images })}
        />
        <Select
          label="Links"
          value={options.links}
          options={
            [
              ['keep', 'Keep'],
              ['text', 'Text only'],
            ] as const
          }
          onChange={(links) => updateOptions({ links })}
        />
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted">
          <input
            type="checkbox"
            checked={options.skipChrome}
            onChange={(e) => updateOptions({ skipChrome: e.target.checked })}
            className="size-3.5 accent-(--color-pine)"
          />
          Skip navigation, headers, footers and sidebars
        </label>
        <label className="flex w-full min-w-0 shrink-0 basis-full items-center gap-1.5 text-xs font-medium text-muted sm:w-auto sm:flex-1 sm:basis-auto">
          Base URL
          <input
            type="url"
            value={options.baseUrl}
            onChange={(e) => updateOptions({ baseUrl: e.target.value })}
            placeholder="https://example.com/page"
            aria-label="Resolve relative links against this URL"
            className="min-w-0 flex-1 rounded-md border border-line-strong bg-card px-2 py-1 font-mono text-xs text-ink placeholder:text-faint focus:border-pine focus:outline-none"
          />
        </label>
      </div>

      {converting && (
        <div className="mb-4 flex items-center gap-3">
          <ProgressBar
            className="min-w-0 flex-1"
            value={percent}
            label={`Converting… ${percent} %`}
          />
          <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
            <X className="size-3.5" />
            Cancel
          </Button>
        </div>
      )}

      <SplitPane
        label="Resize input and output panels"
        first={
          <section aria-label="HTML input">
            <div className="mb-2 flex h-8 items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">HTML</h2>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => void pasteFromClipboard()}>
                  <ClipboardPaste className="size-3.5" />
                  Paste
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll} disabled={!html}>
                  <X className="size-3.5" />
                  Clear
                </Button>
              </div>
            </div>
            <textarea
              id="html-input"
              value={editorValue}
              readOnly={truncatedEditor}
              onChange={(e) => {
                setSourceName(null)
                setHtml(e.target.value)
              }}
              placeholder="Paste HTML here"
              aria-label="HTML to convert"
              spellCheck={false}
              className={cx(
                'h-64 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-[13px] leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none sm:h-80',
                truncatedEditor && 'bg-page',
              )}
            />
            <p className="mt-1 font-mono text-[11px] text-muted tabular-nums">
              {html === ''
                ? 'No input yet.'
                : `${html.length.toLocaleString()} characters · ${formatBytes(byteLength(html))}`}
              {truncatedEditor &&
                ' · large file — the editor shows the first 200 KB; conversion uses the whole file'}
            </p>
            <FileDropzone
              className="mt-3"
              accept={ACCEPT}
              maxSize={MAX_FILE_SIZE}
              onFiles={(files) => void loadFile(files)}
              hint="One .html, .htm or .xhtml file, up to 20 MB"
            />
          </section>
        }
        second={
          <section aria-label="Markdown output">
            <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2">
              <div role="tablist" aria-label="Output view" className="flex gap-1">
                {(
                  [
                    ['markdown', 'Markdown'],
                    ['preview', 'Preview'],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    role="tab"
                    type="button"
                    aria-selected={view === v}
                    onClick={() => setView(v)}
                    className={cx(
                      'cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      view === v ? 'bg-pine text-page' : 'text-muted hover:bg-soft hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <CopyButton text={shownResult?.markdown ?? ''} disabled={!shownResult} />
                <Button variant="secondary" size="sm" onClick={download} disabled={!shownResult}>
                  <Download className="size-3.5" />
                  Download .md
                </Button>
              </div>
            </div>

            {view === 'markdown' ? (
              <textarea
                id="markdown-output"
                value={shownResult?.markdown ?? ''}
                readOnly
                placeholder="The Markdown appears here."
                aria-label="Converted Markdown"
                spellCheck={false}
                className="h-64 w-full resize-y rounded-lg border border-line bg-page p-3 font-mono text-[13px] leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none sm:h-80"
              />
            ) : previewHtml ? (
              <div
                className="md-preview h-64 overflow-auto rounded-lg border border-line bg-card p-4 sm:h-80"
                // Safe: renderMarkdown passes all output through DOMPurify.
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-line-strong text-sm text-muted sm:h-80">
                The rendered Markdown appears here.
              </div>
            )}
          </section>
        }
      />

      {currentFailure?.message === null && (
        <div className="mt-4 flex items-center gap-3">
          <p className="text-xs text-muted">Conversion cancelled.</p>
          <Button variant="secondary" size="sm" onClick={() => setRunId((n) => n + 1)}>
            <RotateCw className="size-3.5" />
            Convert again
          </Button>
        </div>
      )}

      {currentFailure?.message != null && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {currentFailure.message}
        </p>
      )}

      <p aria-live="polite" className="mt-4 font-mono text-xs text-muted tabular-nums">
        {shownResult
          ? formatStatsLine(
              shownResult.htmlBytes,
              byteLength(shownResult.markdown),
              shownResult.counts,
            )
          : 'Paste HTML or drop a file to convert.'}
      </p>

      <p className="mt-2 text-xs text-muted">
        Nothing is uploaded. Scripts, styles and event handlers are stripped before conversion, and
        the preview never loads remote images.
      </p>
    </ToolLayout>
  )
}
