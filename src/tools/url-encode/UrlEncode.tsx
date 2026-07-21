import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { decodeUrlText, encodeUrlText, parseUrl, type EncodeMode, type ParsedUrl } from './url'

type Tab = 'encode' | 'decode' | 'parse'

const TABS: [Tab, string][] = [
  ['encode', 'Encode'],
  ['decode', 'Decode'],
  ['parse', 'Parse'],
]

const SAMPLES: Record<Tab, string> = {
  encode: 'https://example.com/search?q=中文 query&page=1',
  decode: 'https%3A%2F%2Fexample.com%2Fsearch%3Fq%3D%E4%B8%AD%E6%96%87%20query',
  parse: 'https://user:pw@bücher.example:8443/path/to page?q=中文&tag=a&tag=b#section-2',
}

const MODE_HINTS: Record<EncodeMode, string> = {
  component:
    'encodeURIComponent — encodes every reserved character (/ ? & = # …). Use for a single query value or path segment.',
  full: 'encodeURI — keeps URL structure (:// ? & =) intact and encodes only invalid characters. Use on a whole URL.',
}

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 py-2 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 text-xs font-semibold text-muted">{label}</dt>
      <dd className={cx('min-w-0 text-sm break-all text-ink', mono && 'font-mono text-xs')}>
        {value}
      </dd>
    </div>
  )
}

function ParseResult({ parsed }: { parsed: ParsedUrl }) {
  return (
    <section className="mt-6 border-t border-line pt-5" aria-labelledby="parse-heading">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="parse-heading" className="mr-auto text-sm font-semibold text-ink">
          URL breakdown
        </h2>
        <CopyButton text={parsed.href} label="Copy normalized URL" />
      </div>

      {parsed.assumedProtocol && (
        <p className="mb-3 rounded-lg border border-line bg-soft p-3 text-xs text-muted">
          The input has no scheme, so <span className="font-mono">https://</span> was assumed.
        </p>
      )}

      <dl className="divide-y divide-line rounded-lg border border-line bg-card px-4 py-1">
        <Row label="Normalized" value={parsed.href} />
        <Row label="Protocol" value={parsed.protocol} />
        {parsed.username !== undefined && <Row label="Username" value={parsed.username} />}
        {parsed.password !== undefined && <Row label="Password" value={parsed.password} />}
        <Row label="Host" value={parsed.hostname} />
        {parsed.unicodeHostname !== undefined && (
          <Row label="Host (unicode)" value={parsed.unicodeHostname} />
        )}
        {parsed.port !== undefined && <Row label="Port" value={parsed.port} />}
        <Row label="Path" value={parsed.pathname} />
        {parsed.decodedPathname !== undefined && (
          <Row label="Path (decoded)" value={parsed.decodedPathname} />
        )}
        {parsed.hash !== undefined && <Row label="Fragment" value={parsed.hash} />}
        {parsed.decodedHash !== undefined && (
          <Row label="Fragment (decoded)" value={parsed.decodedHash} />
        )}
      </dl>

      <h3 className="mt-5 mb-2 text-sm font-semibold text-ink">
        Query parameters{' '}
        <span className="font-normal text-muted">
          ({parsed.params.length}
          {parsed.params.length !== new Set(parsed.params.map((p) => p.key)).size
            ? ', repeated keys listed separately'
            : ''}
          )
        </span>
      </h3>
      {parsed.params.length === 0 ? (
        <p className="rounded-lg border border-line bg-card p-4 text-sm text-muted">
          This URL has no query parameters.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-soft text-muted">
                <th scope="col" className="w-10 px-3 py-2 font-semibold">
                  #
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Key (decoded)
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Value (decoded)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-card">
              {parsed.params.map((param, index) => (
                <tr key={index}>
                  <td className="px-3 py-2 text-muted tabular-nums">{index + 1}</td>
                  <td className="px-3 py-2 font-mono break-all text-ink">{param.key}</td>
                  <td className="px-3 py-2 font-mono break-all text-ink">{param.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function UrlEncode() {
  const [tab, setTab] = useState<Tab>('encode')
  const [text, setText] = useState('')
  const [mode, setMode] = useState<EncodeMode>('component')

  const result = useMemo((): { output?: string; parsed?: ParsedUrl; error?: string } => {
    if (!text.trim()) return {}
    try {
      if (tab === 'encode') return { output: encodeUrlText(text, mode) }
      if (tab === 'decode') return { output: decodeUrlText(text, mode) }
      return { parsed: parseUrl(text) }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Conversion failed.' }
    }
  }, [tab, text, mode])

  return (
    <ToolLayout
      title="URL encode / decode / parse"
      description="Percent-encode or decode text — component or full-URL mode — and break any URL into protocol, host, path, query parameters and fragment. Everything runs in your browser."
      badge="client-side"
    >
      <div role="tablist" aria-label="Operation" className="mb-4 flex gap-1">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cx(
              'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              tab === value ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== 'parse' && (
        <div className="mb-4 rounded-lg border border-line bg-soft p-3">
          <div className="flex flex-wrap items-center gap-4">
            {(
              [
                ['component', 'Component'],
                ['full', 'Full URL'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted"
              >
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="accent-pine"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-faint">{MODE_HINTS[mode]}</p>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3">
        <textarea
          name="input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            tab === 'encode'
              ? 'Paste text or a URL to encode…'
              : tab === 'decode'
                ? 'Paste percent-encoded text…'
                : 'Paste a URL to break down…'
          }
          aria-label={tab === 'parse' ? 'URL input' : 'Text input'}
          spellCheck={false}
          className={cx(
            'w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none',
            tab === 'parse' ? 'h-24' : 'h-40',
          )}
        />
        <div>
          <Button variant="ghost" size="sm" onClick={() => setText(SAMPLES[tab])}>
            <Sparkles className="size-3.5" />
            Load sample
          </Button>
        </div>
      </div>

      {result.error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-line bg-rose-soft p-3 text-sm text-rose"
        >
          {result.error}
        </p>
      )}

      {result.output !== undefined && (
        <section className="mt-6 border-t border-line pt-5" aria-labelledby="output-heading">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 id="output-heading" className="mr-auto text-sm font-semibold text-ink">
              {tab === 'encode' ? 'Encoded output' : 'Decoded output'}
            </h2>
            <CopyButton text={result.output} />
          </div>
          <textarea
            name="output"
            readOnly
            value={result.output}
            aria-label="Output"
            spellCheck={false}
            className="h-40 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed break-all text-ink focus:border-pine focus:outline-none"
          />
        </section>
      )}

      {result.parsed && <ParseResult parsed={result.parsed} />}
    </ToolLayout>
  )
}
