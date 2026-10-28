import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, Globe, Lock, ShieldAlert, Sparkles } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { useOnline } from '../../lib/useOnline'
import {
  REPO_URL,
  analyze,
  parseResponseText,
  parseTarget,
  type ScanResult,
  type ScanStatus,
} from './scan'

type Mode = 'scan' | 'paste'

const STATUS_LABEL: Record<ScanStatus, string> = {
  vulnerable: 'Vulnerable',
  likely_vulnerable: 'Likely vulnerable',
  unknown: 'PHP found, version hidden',
  patched: 'Patched',
  no_php_detected: 'No PHP detected',
  unreachable: 'Unreachable',
}

const STATUS_TONE: Record<ScanStatus, string> = {
  vulnerable: 'border-rose bg-rose-soft text-rose',
  likely_vulnerable: 'border-amber-badge/40 bg-amber-soft text-amber-badge',
  unknown: 'border-amber-badge/40 bg-amber-soft text-amber-badge',
  patched: 'border-pine/30 bg-mint/40 text-pine',
  no_php_detected: 'border-line bg-soft text-muted',
  unreachable: 'border-line bg-soft text-muted',
}

const SAMPLE = `HTTP/1.1 200 OK
Date: Tue, 27 Oct 2026 09:12:44 GMT
Server: Apache/2.4.58 (Ubuntu)
X-Powered-By: PHP/8.3.10
Set-Cookie: PHPSESSID=8k2j4h5g6f7d8s9a; path=/; HttpOnly
Content-Type: text/html; charset=UTF-8

<!doctype html>
<form action="/login.php" method="post">…</form>`

const inputClass =
  'w-full rounded-lg border border-line bg-card px-3 text-sm text-ink placeholder:text-faint focus:border-pine focus:outline-none'

function statusHeadline(result: ScanResult): string {
  const version = result.phpVersion ? ` (PHP ${result.phpVersion})` : ''
  return STATUS_LABEL[result.status] + version
}

function reportText(result: ScanResult): string {
  const lines = [`Status: ${statusHeadline(result)}`]
  if (result.url) lines.unshift(`Checked: ${result.url}`)
  if (result.product) lines.push(`Device: ${result.product} (${result.advisory})`)
  if (result.evidence.length > 0) lines.push(`Found in: ${result.evidence.join('; ')}`)
  lines.push(`What to do: ${result.advice}`)
  if (result.error) lines.push(`Error: ${result.error}`)
  return lines.join('\n')
}

function ResultCard({ result }: { result: ScanResult }) {
  return (
    <section
      aria-label="Result"
      className="mt-6 flex flex-col gap-4 rounded-lg border border-line bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cx(
            'rounded-md border px-2.5 py-1 text-sm font-semibold',
            STATUS_TONE[result.status],
          )}
        >
          {statusHeadline(result)}
        </span>
        <CopyButton text={() => reportText(result)} label="Copy report" />
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr]">
        {result.url && (
          <>
            <dt className="text-xs font-semibold text-muted">Checked</dt>
            <dd className="font-mono text-xs break-all text-ink">{result.url}</dd>
          </>
        )}
        {result.product && (
          <>
            <dt className="text-xs font-semibold text-muted">Device</dt>
            <dd className="text-ink">
              {result.product}{' '}
              <a
                href={result.advisory}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-pine underline"
              >
                Vendor advisory
                <ExternalLink className="size-3" />
              </a>
            </dd>
          </>
        )}
        <dt className="text-xs font-semibold text-muted">Found in</dt>
        <dd className="text-ink">
          {result.evidence.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {result.evidence.map((item) => (
                <li key={item} className="font-mono text-xs break-all">
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-muted">Nothing PHP-specific in this response</span>
          )}
        </dd>
        <dt className="text-xs font-semibold text-muted">What to do</dt>
        <dd className="leading-relaxed text-ink">{result.advice}</dd>
        {result.error && (
          <>
            <dt className="text-xs font-semibold text-muted">Error</dt>
            <dd className="font-mono text-xs break-all text-rose">{result.error}</dd>
          </>
        )}
      </dl>
    </section>
  )
}

type ScanState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: ScanResult }
  | { kind: 'error'; message: string }

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string') return body.error
  } catch {
    /* not JSON: the scanner is not reachable at this origin */
  }
  return `The scanner is unavailable right now (HTTP ${response.status}). Try again later, or paste a response instead.`
}

function ScanPanel() {
  const online = useOnline()
  const [address, setAddress] = useState('')
  const [state, setState] = useState<ScanState>({ kind: 'idle' })
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      parseTarget(address)
    } catch (cause) {
      setState({ kind: 'error', message: (cause as Error).message })
      return
    }
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setState({ kind: 'loading' })
    try {
      const response = await fetch(`/api/phpscan?url=${encodeURIComponent(address.trim())}`, {
        signal: controller.signal,
      })
      if (!response.ok) {
        setState({ kind: 'error', message: await errorMessage(response) })
        return
      }
      setState({ kind: 'done', result: (await response.json()) as ScanResult })
    } catch (cause) {
      if (controller.signal.aborted) return
      setState({
        kind: 'error',
        message:
          cause instanceof Error ? `Could not reach the scanner: ${cause.message}` : String(cause),
      })
    }
  }

  return (
    <>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
        <label htmlFor="phptest-url" className="text-xs font-semibold text-muted">
          Website address
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="phptest-url"
            name="url"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            inputMode="url"
            placeholder="www.example.com"
            autoComplete="url"
            spellCheck={false}
            required
            className={cx(inputClass, 'h-10')}
          />
          <Button
            type="submit"
            disabled={!online || state.kind === 'loading' || address.trim() === ''}
            className="shrink-0"
          >
            {state.kind === 'loading' ? 'Checking…' : 'Check'}
          </Button>
        </div>
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Globe className="mt-0.5 size-3.5 shrink-0" />
          The address is sent to the NYMBX scanner, which opens the page once from Cloudflare&apos;s
          network, like a browser visit: one GET on port 80 or 443, no attack, no login. Nothing is
          stored.
        </p>
        {!online && (
          <p role="status" className="text-xs text-amber-badge">
            You&apos;re offline. Website checks need a connection; pasting a response still works.
          </p>
        )}
      </form>

      {state.kind === 'error' && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-rose bg-rose-soft px-3 py-2 text-xs text-rose"
        >
          {state.message}
        </p>
      )}
      <div role="status" aria-live="polite">
        {state.kind === 'done' && <ResultCard result={state.result} />}
      </div>
    </>
  )
}

/** A full address or a bare path; the analyzer only needs the path. */
function pagePath(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.startsWith('/')) return trimmed
  try {
    return parseTarget(trimmed).pathname
  } catch {
    return ''
  }
}

function PastePanel() {
  const [text, setText] = useState('')
  const [page, setPage] = useState('')
  const debouncedText = useDebouncedValue(text, 150)

  const result = useMemo(
    () =>
      debouncedText.trim() === ''
        ? null
        : analyze(parseResponseText(debouncedText, pagePath(page))),
    [debouncedText, page],
  )

  return (
    <>
      <div className="flex flex-col gap-2">
        <label htmlFor="phptest-page" className="text-xs font-semibold text-muted">
          Page address (optional)
        </label>
        <input
          id="phptest-page"
          name="page"
          value={page}
          onChange={(event) => setPage(event.target.value)}
          placeholder="https://intranet.example/login.php"
          spellCheck={false}
          autoComplete="off"
          className={cx(inputClass, 'h-10 font-mono text-xs')}
        />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="phptest-response" className="text-xs font-semibold text-muted">
            Response headers and page source
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setText(SAMPLE)
              setPage('/index.php')
            }}
          >
            <Sparkles className="size-3.5" />
            Load sample
          </Button>
        </div>
        <textarea
          id="phptest-response"
          name="response"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            'Paste the output of  curl -si https://your-site\nor the raw response headers from your browser devtools'
          }
          spellCheck={false}
          autoComplete="off"
          className="h-56 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
        />
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0" />
          Analyzed in your browser; nothing is sent. Use this for internal hosts, sites behind a
          login, or a response you already captured.
        </p>
      </div>
      {result && <ResultCard result={result} />}
    </>
  )
}

export default function Phptest() {
  const [mode, setMode] = useState<Mode>('scan')

  return (
    <ToolLayout>
      <div
        role="note"
        className="mb-4 flex items-start gap-2 rounded-lg border border-pine/25 bg-mint/30 px-3 py-2.5 text-xs text-pine"
      >
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">PHP2Shell</strong> (CVE-2026-109618, CVE-2026-109619)
          lets attackers take over servers running an outdated PHP. It is fixed in 8.2.35, 8.3.36,
          8.4.27 and 8.5.12. This check reads the PHP version a site reports; it detects and reports
          only.
        </p>
      </div>

      <div role="tablist" aria-label="Mode" className="mb-4 flex flex-wrap gap-1">
        {(
          [
            ['scan', 'Scan a website'],
            ['paste', 'Analyze a response'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cx(
              'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              mode === value ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'scan' ? <ScanPanel /> : <PastePanel />}

      <p className="mt-8 text-xs text-muted">
        A version string is evidence, not proof: distributions backport fixes without changing it,
        and many servers hide it. Routers, modems, NAS and other devices on your own network can be
        affected too. Check them with the free, open-source{' '}
        <a
          href={`${REPO_URL}/releases`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-pine underline"
        >
          phpscan-local companion tool
          <ExternalLink className="size-3" />
        </a>
        .
      </p>
    </ToolLayout>
  )
}
