import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import type { RegexWorkerApi } from './regex.worker'
import type { RegexRunResult } from './regex'

/** Kill the worker when a run takes this long — catastrophic backtracking. */
const TIMEOUT_MS = 2000
const DEBOUNCE_MS = 250

const FLAGS: [string, string][] = [
  ['g', 'global — find every match'],
  ['i', 'ignore case'],
  ['m', 'multiline — ^ and $ match per line'],
  ['s', 'dotAll — . matches newlines'],
  ['u', 'unicode'],
  ['v', 'unicodeSets'],
  ['y', 'sticky — matches must be adjacent'],
]

const SAMPLE = {
  pattern: String.raw`(?<user>\w[\w.]*)@(?<domain>[\w.-]+\.\w+)`,
  flags: 'g',
  text: 'Contact ann@example.com or bob.smith@dev.example.org.\nInvalid: not-an-email, foo@, @bar.com',
  replacement: '<$<user> AT $<domain>>',
}

class TimeoutError extends Error {}

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (cause: unknown) => {
        clearTimeout(timer)
        reject(cause instanceof Error ? cause : new Error(String(cause)))
      },
    )
  })
}

/** Test text with every (non-empty) match wrapped in a highlight mark. */
function Highlighted({ text, result }: { text: string; result: RegexRunResult }) {
  const parts: ReactNode[] = []
  let cursor = 0
  for (const [i, match] of result.matches.entries()) {
    if (match.value === '') continue
    if (match.index > cursor) parts.push(text.slice(cursor, match.index))
    parts.push(
      <mark key={i} className="rounded-sm bg-mint px-0.5 text-pine">
        {match.value}
      </mark>,
    )
    cursor = match.end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return (
    <div className="max-h-56 overflow-auto rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-ink">
      {parts}
    </div>
  )
}

export default function RegexTester() {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('')
  const [replacement, setReplacement] = useState('')
  const [result, setResult] = useState<RegexRunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const workerRef = useRef<WorkerHandle<RegexWorkerApi> | null>(null)
  const runIdRef = useRef(0)
  useEffect(() => () => workerRef.current?.terminate(), [])

  function worker() {
    workerRef.current ??= wrapWorker<RegexWorkerApi>(
      new Worker(new URL('./regex.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current.api
  }

  useEffect(() => {
    const id = ++runIdRef.current
    const timer = setTimeout(() => {
      if (!pattern) {
        setResult(null)
        setError(null)
        setBusy(false)
        return
      }
      setBusy(true)
      void (async () => {
        try {
          const res = await raceTimeout(worker().run(pattern, flags, text, replacement), TIMEOUT_MS)
          if (runIdRef.current !== id) return
          setResult(res)
          setError(null)
        } catch (cause) {
          if (runIdRef.current !== id) return
          if (cause instanceof TimeoutError) {
            // The worker is stuck backtracking — kill it; the next run gets a fresh one.
            workerRef.current?.terminate()
            workerRef.current = null
            setError(
              `Execution timed out after ${TIMEOUT_MS / 1000} s — the pattern likely suffers from catastrophic backtracking on this text. The page stays responsive; simplify the pattern and try again.`,
            )
          } else {
            setError(cause instanceof Error ? cause.message : 'Failed to run the pattern.')
          }
          setResult(null)
        } finally {
          if (runIdRef.current === id) setBusy(false)
        }
      })()
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [pattern, flags, text, replacement])

  function toggleFlag(flag: string) {
    setFlags((current) => (current.includes(flag) ? current.replace(flag, '') : current + flag))
  }

  const uniqueMatches = result?.matches ?? []

  return (
    <ToolLayout
      title="Regex tester"
      description="Try a JavaScript regular expression against test text: live match highlighting, capture groups per match, and a replace preview. Patterns run in a worker with a timeout, so a catastrophic pattern can't freeze the page."
      badge="client-side"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <label className="flex min-w-0 grow flex-col gap-1">
            <span className="text-xs font-semibold text-muted">Pattern</span>
            <div className="flex items-center gap-1 rounded-lg border border-line bg-card px-3 focus-within:border-pine">
              <span aria-hidden className="font-mono text-sm text-faint">
                /
              </span>
              <input
                name="pattern"
                value={pattern}
                onChange={(event) => setPattern(event.target.value)}
                placeholder="(?<name>pattern)"
                aria-label="Pattern"
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 grow bg-transparent py-2 font-mono text-sm text-ink placeholder:text-faint focus:outline-none"
              />
              <span aria-hidden className="font-mono text-sm text-faint">
                /{flags}
              </span>
            </div>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-xs font-semibold text-muted">Flags</legend>
            <div className="flex flex-wrap gap-1">
              {FLAGS.map(([flag, title]) => (
                <label
                  key={flag}
                  title={title}
                  className={cx(
                    'flex cursor-pointer items-center justify-center rounded-md border px-2.5 py-1.5 font-mono text-xs font-semibold transition-colors',
                    flags.includes(flag)
                      ? 'border-pine bg-mint text-pine'
                      : 'border-line bg-card text-muted hover:text-ink',
                  )}
                >
                  <input
                    type="checkbox"
                    name={`flag-${flag}`}
                    checked={flags.includes(flag)}
                    onChange={() => toggleFlag(flag)}
                    className="sr-only"
                  />
                  {flag}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted">Test text</span>
          <textarea
            name="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste text to test the pattern against…"
            aria-label="Test text"
            spellCheck={false}
            className="h-40 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
          />
        </label>

        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPattern(SAMPLE.pattern)
              setFlags(SAMPLE.flags)
              setText(SAMPLE.text)
              setReplacement(SAMPLE.replacement)
            }}
          >
            <Sparkles className="size-3.5" />
            Load sample
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-line bg-rose-soft p-3 text-sm text-rose"
        >
          {error}
        </p>
      )}

      {result && !error && (
        <section className="mt-6 border-t border-line pt-5" aria-labelledby="matches-heading">
          <h2 id="matches-heading" className="mb-3 text-sm font-semibold text-ink">
            Matches{' '}
            <span className="font-normal text-muted">
              ({uniqueMatches.length}
              {result.truncated ? `, showing the first ${uniqueMatches.length}` : ''})
            </span>
            {busy && <span className="ml-2 font-normal text-faint">running…</span>}
          </h2>

          {uniqueMatches.length === 0 ? (
            <p className="rounded-lg border border-line bg-card p-4 text-sm text-muted">
              No matches in the test text.
            </p>
          ) : (
            <>
              <Highlighted text={text} result={result} />

              <div className="mt-4 overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-soft text-muted">
                      <th scope="col" className="w-10 px-3 py-2 font-semibold">
                        #
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Match
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Range
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        Groups
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-card">
                    {uniqueMatches.map((match, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 align-top text-muted tabular-nums">{index + 1}</td>
                        <td className="px-3 py-2 align-top font-mono break-all text-ink">
                          {match.value === '' ? (
                            <span className="text-faint italic">(empty)</span>
                          ) : (
                            match.value
                          )}
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-muted tabular-nums">
                          {match.index}–{match.end}
                        </td>
                        <td className="px-3 py-2 align-top font-mono break-all text-ink">
                          {match.groups.length === 0 ? (
                            <span className="text-faint">—</span>
                          ) : (
                            match.groups.map((group) => (
                              <div key={group.number}>
                                <span className="text-muted">
                                  ${group.number}
                                  {group.name !== undefined && ` (${group.name})`}
                                </span>
                                {group.value === undefined ? (
                                  <span className="text-faint italic"> not matched</span>
                                ) : (
                                  <> = {group.value === '' ? '(empty)' : group.value}</>
                                )}
                              </div>
                            ))
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.truncated && (
                <p className="mt-2 text-xs text-muted">
                  Match list capped — refine the pattern to see the rest.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {result && !error && (
        <section className="mt-6 border-t border-line pt-5" aria-labelledby="replace-heading">
          <h2 id="replace-heading" className="mb-3 text-sm font-semibold text-ink">
            Replace preview
          </h2>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">
              Replacement{' '}
              <span className="font-normal text-faint">
                ($1, $&lt;name&gt;, $&amp; supported — empty deletes matches)
              </span>
            </span>
            <input
              name="replacement"
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              placeholder="Replacement string…"
              aria-label="Replacement"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus:border-pine focus:outline-none"
            />
          </label>
          {result.replaced !== undefined && (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">Result</span>
                <CopyButton text={result.replaced} />
              </div>
              <div className="max-h-56 overflow-auto rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-ink">
                {result.replaced}
              </div>
            </div>
          )}
        </section>
      )}
    </ToolLayout>
  )
}
