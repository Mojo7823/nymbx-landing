import { useEffect, useRef, useState } from 'react'
import {
  Braces,
  CheckCircle2,
  Download,
  FileUp,
  FileWarning,
  ListTree,
  Minimize2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { errorExcerpt, type JsonError } from './jsonTools'
import type { JsonMode, JsonWorkerApi } from './json.worker'
import { JsonTree, type JsonValue } from './JsonTree'

/** Above this the textarea is replaced by a summary card (editing huge text janks). */
const EDIT_LIMIT = 2 * 1024 * 1024
/** Above this the text output is download-only. */
const DISPLAY_LIMIT = 2 * 1024 * 1024
/** Above this the tree view is disabled. */
const TREE_LIMIT = 10 * 1024 * 1024

const SAMPLE = `{
  "name": "NYMBX Toolbox",
  "version": 2,
  "clientSide": true,
  "bigId": 92233720368547758079,
  "tools": [
    { "slug": "json-formatter", "phase": 23, "tags": ["text", "dev"] },
    { "slug": "diff-checker", "phase": 3, "tags": [] }
  ],
  "meta": { "license": null, "score": 99.5 }
}`

const INDENTS = { '2': '  ', '4': '    ', tab: '\t' } as const
type IndentKey = keyof typeof INDENTS

interface RunResult {
  mode: JsonMode
  output?: string
  error?: JsonError
  riskyNumbers: number
  inputBytes: number
}

export default function JsonFormatter() {
  const [text, setText] = useState('')
  const [bigFile, setBigFile] = useState<{ name: string; size: number } | null>(null)
  const [baseName, setBaseName] = useState('data')
  const [indentKey, setIndentKey] = useState<IndentKey>('2')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [view, setView] = useState<'text' | 'tree'>('text')
  const [tree, setTree] = useState<JsonValue | null>(null)

  const workerRef = useRef<WorkerHandle<JsonWorkerApi> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => workerRef.current?.terminate(), [])

  async function openFile(file: File | undefined) {
    if (!file) return
    const content = await file.text()
    setText(content)
    setBigFile(content.length > EDIT_LIMIT ? { name: file.name, size: file.size } : null)
    setBaseName(file.name.replace(/\.json$/i, ''))
    setResult(null)
    setTree(null)
  }

  function clearAll() {
    setText('')
    setBigFile(null)
    setResult(null)
    setTree(null)
  }

  async function run(mode: JsonMode) {
    if (!text.trim() || busy) return
    setBusy(true)
    setResult(null)
    setTree(null)
    setView('text')
    try {
      workerRef.current ??= wrapWorker<JsonWorkerApi>(
        new Worker(new URL('./json.worker.ts', import.meta.url), { type: 'module' }),
      )
      const r = await workerRef.current.api.process(text, mode, INDENTS[indentKey])
      setResult({
        mode,
        output: r.output,
        error: r.error,
        riskyNumbers: r.riskyNumbers,
        inputBytes: new Blob([text]).size,
      })
    } finally {
      setBusy(false)
    }
  }

  function showTree() {
    setView('tree')
    if (tree !== null || !result?.output) return
    if (result.output.length <= TREE_LIMIT) {
      // Display only — the byte-exact text output above is the source of truth.
      setTree(JSON.parse(result.output) as JsonValue)
    }
  }

  const output = result?.output
  const outputBytes = output !== undefined ? new Blob([output]).size : 0
  const excerpt = result?.error ? errorExcerpt(text, result.error) : null

  return (
    <ToolLayout
      title="JSON formatter"
      description="Format, minify and validate JSON with exact error positions. Big integers are preserved byte-for-byte, not rounded. Everything stays in your browser."
      badge="client-side"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
          <FileUp className="size-3.5" />
          Open .json file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json,text/plain"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void openFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <Button variant="ghost" size="sm" onClick={() => setText(SAMPLE)}>
          <Sparkles className="size-3.5" />
          Load sample
        </Button>
        <span className="ml-auto font-mono text-[11px] text-muted tabular-nums">
          {formatBytes(new Blob([text]).size)}
        </span>
      </div>

      {bigFile ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-card p-4">
          <Braces className="size-5 shrink-0 text-pine" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{bigFile.name}</p>
            <p className="font-mono text-[11px] text-muted tabular-nums">
              {formatBytes(bigFile.size)} — too large to edit inline, actions still work
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <Trash2 className="size-3.5" />
            Clear
          </Button>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setResult(null)
            setTree(null)
          }}
          placeholder='Paste JSON here, e.g. {"hello": "world"} — or open a file…'
          aria-label="JSON input"
          spellCheck={false}
          className="h-56 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none md:h-72"
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
          Indent
          <select
            value={indentKey}
            onChange={(e) => setIndentKey(e.target.value as IndentKey)}
            className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
          >
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
            <option value="tab">Tab</option>
          </select>
        </label>
        <Button onClick={() => void run('format')} disabled={!text.trim() || busy}>
          <Braces className="size-4" />
          Format
        </Button>
        <Button
          variant="secondary"
          onClick={() => void run('minify')}
          disabled={!text.trim() || busy}
        >
          <Minimize2 className="size-4" />
          Minify
        </Button>
        <Button
          variant="secondary"
          onClick={() => void run('validate')}
          disabled={!text.trim() || busy}
        >
          <CheckCircle2 className="size-4" />
          Validate
        </Button>
        {busy && <ProgressBar className="min-w-32 flex-1" label="Processing" />}
      </div>

      {result?.error && excerpt && (
        <div role="alert" className="mt-4 rounded-lg border border-line bg-card p-4">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            {result.error.message} — line {result.error.line}, column {result.error.col}
          </p>
          <pre className="mt-2 overflow-x-auto font-mono text-xs leading-5 text-ink">
            {excerpt.line}
            {'\n'}
            <span className="text-red-600 dark:text-red-400">{excerpt.caret}</span>
          </pre>
        </div>
      )}

      {result && !result.error && (
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-pine" role="status">
              <CheckCircle2 className="size-4" aria-hidden />
              Valid JSON
              {result.mode !== 'validate' && (
                <span className="font-mono text-[11px] text-muted tabular-nums">
                  {formatBytes(result.inputBytes)} → {formatBytes(outputBytes)}
                </span>
              )}
            </p>
            {output !== undefined && (
              <>
                <div role="tablist" aria-label="Output view" className="flex gap-1">
                  {(
                    [
                      ['text', 'Text', Braces],
                      ['tree', 'Tree', ListTree],
                    ] as const
                  ).map(([v, label, Icon]) => (
                    <button
                      key={v}
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => (v === 'tree' ? showTree() : setView('text'))}
                      className={cx(
                        'inline-flex cursor-pointer items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                        view === v ? 'bg-mint text-pine' : 'text-muted hover:text-ink',
                      )}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>
                {output.length <= DISPLAY_LIMIT && <CopyButton text={output} />}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadBlob(
                      new Blob([output], { type: 'application/json' }),
                      `${baseName}${result.mode === 'minify' ? '.min' : ''}.json`,
                    )
                  }
                >
                  <Download className="size-3.5" />
                  Download
                </Button>
              </>
            )}
          </div>

          {result.riskyNumbers > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-amber-badge" role="status">
              <FileWarning className="mt-0.5 size-3.5 shrink-0" />
              {result.riskyNumbers}{' '}
              {result.riskyNumbers === 1 ? 'integer exceeds' : 'integers exceed'} JavaScript's safe
              range. The output preserves {result.riskyNumbers === 1 ? 'it' : 'them'} exactly, but
              JavaScript consumers (JSON.parse) will round.
            </p>
          )}

          {output !== undefined &&
            view === 'text' &&
            (output.length > DISPLAY_LIMIT ? (
              <p className="rounded-lg border border-line bg-card p-4 text-xs text-muted">
                Output is {formatBytes(outputBytes)} — too large to display; use Download.
              </p>
            ) : (
              <pre className="max-h-96 overflow-auto rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre text-ink">
                {output}
              </pre>
            ))}

          {output !== undefined &&
            view === 'tree' &&
            (output.length > TREE_LIMIT ? (
              <p className="rounded-lg border border-line bg-card p-4 text-xs text-muted">
                Tree view is disabled for documents over {formatBytes(TREE_LIMIT)}.
              </p>
            ) : (
              tree !== null && <JsonTree value={tree} />
            ))}
        </div>
      )}
    </ToolLayout>
  )
}
