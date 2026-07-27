import { useEffect, useRef, useState } from 'react'
import { Check, ClipboardPaste, X } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { SplitPane } from '../../components/SplitPane'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { toast } from '../../lib/toast'
import { cx } from '../../lib/cx'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { useIsDark } from '../../lib/useIsDark'
import type { DiffSummary, Granularity } from './diffEngine'
import type { DiffWorkerApi } from './diff.worker'

type ViewMode = 'side-by-side' | 'inline'

const viewModes: { id: ViewMode; label: string }[] = [
  { id: 'side-by-side', label: 'Side by side' },
  { id: 'inline', label: 'Inline' },
]

const granularities: { id: Granularity; label: string }[] = [
  { id: 'chars', label: 'Chars' },
  { id: 'words', label: 'Words' },
  { id: 'lines', label: 'Lines' },
]

const unitLabel: Record<Granularity, string> = { chars: 'chars', words: 'words', lines: 'lines' }

/** Inline line-mode rows rendered before truncating with a notice. */
const MAX_INLINE_ROWS = 5000

const textareaClasses =
  'h-40 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-[13px] leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none sm:h-48'

/** CodeMirror merge view (read-only) for the side-by-side display. */
function SideBySideDiff({ a, b }: { a: string; b: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const dark = useIsDark()

  useEffect(() => {
    const parent = ref.current
    if (!parent) return
    let destroyed = false
    let destroy = () => {}
    void Promise.all([
      import('@codemirror/merge'),
      import('@codemirror/view'),
      import('@codemirror/state'),
    ]).then(([{ MergeView }, { EditorView, lineNumbers }, { EditorState }]) => {
      if (destroyed) return
      const extensions = [
        lineNumbers(),
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        EditorView.lineWrapping,
        EditorView.theme(
          {
            '&': { backgroundColor: 'transparent', fontSize: '13px', maxHeight: '560px' },
            '.cm-content': { fontFamily: 'var(--font-mono)' },
            '.cm-scroller': { overflow: 'auto', lineHeight: '1.6' },
            '.cm-gutters': {
              backgroundColor: 'var(--c-soft)',
              color: 'var(--c-faint)',
              border: 'none',
            },
          },
          { dark },
        ),
      ]
      const view = new MergeView({
        a: { doc: a, extensions },
        b: { doc: b, extensions },
        parent,
        gutter: true,
        collapseUnchanged: { margin: 3, minSize: 8 },
      })
      destroy = () => view.destroy()
    })
    return () => {
      destroyed = true
      destroy()
    }
  }, [a, b, dark])

  return <div ref={ref} className="overflow-hidden rounded-lg border border-line bg-card" />
}

/** jsdiff-powered inline rendering honoring the granularity toggle. */
function InlineDiff({ summary }: { summary: DiffSummary }) {
  if (summary.granularity === 'lines') {
    const rows: { type: 'add' | 'del' | 'same'; text: string }[] = []
    for (const part of summary.parts) {
      const type = part.added ? 'add' : part.removed ? 'del' : 'same'
      for (const line of part.value.replace(/\n$/, '').split('\n')) rows.push({ type, text: line })
    }
    const truncated = rows.length > MAX_INLINE_ROWS
    return (
      <div className="overflow-x-auto rounded-lg border border-line bg-card py-2 font-mono text-[13px] leading-relaxed">
        {rows.slice(0, MAX_INLINE_ROWS).map((row, i) => (
          <div
            key={i}
            className={cx(
              'flex min-w-max gap-3 px-3 whitespace-pre',
              row.type === 'add' && 'bg-mint text-pine-deep',
              row.type === 'del' && 'bg-rose-soft text-rose',
            )}
          >
            <span className="w-3 shrink-0 select-none">
              {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}
            </span>
            {row.text}
          </div>
        ))}
        {truncated && (
          <p className="border-t border-line px-3 pt-2 text-xs text-muted">
            Showing the first {MAX_INLINE_ROWS.toLocaleString()} lines. Use “Copy unified diff” for
            the complete output.
          </p>
        )}
      </div>
    )
  }

  return (
    <pre className="rounded-lg border border-line bg-card p-3 font-mono text-[13px] leading-relaxed break-words whitespace-pre-wrap">
      {summary.parts.map((part, i) =>
        part.added ? (
          <ins key={i} className="bg-mint text-pine-deep no-underline">
            {part.value}
          </ins>
        ) : part.removed ? (
          <del key={i} className="bg-rose-soft text-rose">
            {part.value}
          </del>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </pre>
  )
}

interface InputPaneProps {
  id: string
  title: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}

function InputPane({ id, title, value, onChange, placeholder }: InputPaneProps) {
  async function paste() {
    try {
      onChange(await navigator.clipboard.readText())
    } catch {
      toast('Clipboard access was blocked. Paste into the text box instead.', {
        variant: 'error',
      })
    }
  }

  return (
    <section aria-label={title}>
      <div className="mb-2 flex h-8 items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={paste}>
            <ClipboardPaste className="size-3.5" />
            Paste
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChange('')} disabled={!value}>
            <X className="size-3.5" />
            Clear
          </Button>
        </div>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={title}
        spellCheck={false}
        className={textareaClasses}
      />
    </section>
  )
}

interface DiffResult {
  a: string
  b: string
  granularity: Granularity
  ignoreWhitespace: boolean
  summary: DiffSummary
  unified: string
}

export default function DiffChecker() {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [view, setView] = useState<ViewMode>('side-by-side')
  const [granularity, setGranularity] = useState<Granularity>('words')
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [result, setResult] = useState<DiffResult | null>(null)

  const aDebounced = useDebouncedValue(a, 250)
  const bDebounced = useDebouncedValue(b, 250)
  const statsGranularity: Granularity = view === 'inline' ? granularity : 'lines'

  const workerRef = useRef<WorkerHandle<DiffWorkerApi> | null>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    const handle = wrapWorker<DiffWorkerApi>(
      new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' }),
    )
    workerRef.current = handle
    return () => {
      workerRef.current = null
      handle.terminate()
    }
  }, [])

  useEffect(() => {
    const api = workerRef.current?.api
    if (!api) return
    if (aDebounced === '' && bDebounced === '') return
    const id = ++requestSeq.current
    void Promise.all([
      api.compute(aDebounced, bDebounced, statsGranularity, ignoreWhitespace),
      api.unified(aDebounced, bDebounced, ignoreWhitespace),
    ]).then(([summary, unified]) => {
      if (requestSeq.current !== id) return
      setResult({
        a: aDebounced,
        b: bDebounced,
        granularity: statsGranularity,
        ignoreWhitespace,
        summary,
        unified,
      })
    })
  }, [aDebounced, bDebounced, statsGranularity, ignoreWhitespace])

  const empty = aDebounced === '' && bDebounced === ''
  // The stored result is only valid while it matches the current inputs and
  // options; anything else means the worker is (about to be) recomputing.
  const current =
    !empty &&
    result &&
    result.a === aDebounced &&
    result.b === bDebounced &&
    result.granularity === statsGranularity &&
    result.ignoreWhitespace === ignoreWhitespace
      ? result
      : null
  const summary = current?.summary ?? null
  const unified = current?.unified ?? ''
  const computing = !empty && !current
  const granularityDisabled = view === 'side-by-side'

  return (
    <ToolLayout
      title="Diff checker"
      description="Compare two texts side by side or inline, at character, word or line granularity. Everything runs in your browser."
      badge="client-side"
    >
      <SplitPane
        label="Resize the two inputs"
        first={
          <InputPane
            id="diff-a"
            title="Original"
            value={a}
            onChange={setA}
            placeholder="Paste the original text…"
          />
        }
        second={
          <InputPane
            id="diff-b"
            title="Changed"
            value={b}
            onChange={setB}
            placeholder="Paste the changed text…"
          />
        }
      />

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <fieldset className="flex items-center gap-3">
          <legend className="sr-only">View mode</legend>
          <span className="text-xs font-medium text-muted">View</span>
          <div className="flex overflow-hidden rounded-md border border-line-strong">
            {viewModes.map((m) => (
              <label
                key={m.id}
                className={cx(
                  'cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors not-first:border-l not-first:border-line',
                  view === m.id ? 'bg-pine text-page' : 'bg-card text-muted hover:bg-mint',
                )}
              >
                <input
                  type="radio"
                  name="diff-view"
                  value={m.id}
                  checked={view === m.id}
                  onChange={() => setView(m.id)}
                  className="sr-only"
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset
          className={cx(
            'flex items-center gap-3',
            granularityDisabled && 'pointer-events-none opacity-40',
          )}
          title={granularityDisabled ? 'Granularity applies to the inline view' : undefined}
        >
          <legend className="sr-only">Diff granularity</legend>
          <span className="text-xs font-medium text-muted">Granularity</span>
          <div className="flex overflow-hidden rounded-md border border-line-strong">
            {granularities.map((g) => (
              <label
                key={g.id}
                className={cx(
                  'cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors not-first:border-l not-first:border-line',
                  granularity === g.id && !granularityDisabled
                    ? 'bg-pine text-page'
                    : 'bg-card text-muted hover:bg-mint',
                )}
              >
                <input
                  type="radio"
                  name="diff-granularity"
                  value={g.id}
                  checked={granularity === g.id}
                  onChange={() => setGranularity(g.id)}
                  disabled={granularityDisabled}
                  className="sr-only"
                />
                {g.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted">
          <input
            id="diff-ignore-ws"
            type="checkbox"
            checked={ignoreWhitespace}
            onChange={(e) => setIgnoreWhitespace(e.target.checked)}
            className="size-3.5 accent-(--color-pine)"
          />
          Ignore whitespace
        </label>

        <div className="ml-auto flex items-center gap-3">
          <span aria-live="polite" className="font-mono text-xs text-muted tabular-nums">
            {computing
              ? 'Computing…'
              : summary && !summary.identical && !summary.timedOut
                ? `+${summary.added} −${summary.removed} ${unitLabel[summary.granularity]}`
                : ''}
          </span>
          <CopyButton
            text={unified}
            label="Copy unified diff"
            disabled={!unified || !summary || summary.identical}
          />
        </div>
      </div>

      {empty ? (
        <p className="rounded-lg border border-dashed border-line-strong py-12 text-center text-sm text-muted">
          Paste text into both panes to see the differences.
        </p>
      ) : summary?.identical ? (
        <p
          role="status"
          className="flex items-center justify-center gap-2 rounded-lg border border-line bg-mint py-12 text-sm font-medium text-pine-deep"
        >
          <Check className="size-4" />
          No differences found{ignoreWhitespace ? ' (whitespace ignored)' : ''}.
        </p>
      ) : summary?.timedOut ? (
        <p
          role="alert"
          className="rounded-lg border border-line bg-amber-soft px-4 py-6 text-center text-sm text-amber-badge"
        >
          These inputs are too large or too different for {summary.granularity}-level comparison.
          Switch granularity to “Lines”.
        </p>
      ) : view === 'side-by-side' ? (
        <SideBySideDiff a={aDebounced} b={bDebounced} />
      ) : summary ? (
        <InlineDiff summary={summary} />
      ) : null}
    </ToolLayout>
  )
}
