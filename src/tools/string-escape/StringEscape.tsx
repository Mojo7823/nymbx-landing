import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { escapeText, unescapeText, MODE_LABELS, type EscapeMode } from './escape'

const MODES = Object.keys(MODE_LABELS) as EscapeMode[]

const SAMPLE = 'He said "hi"; it\'s $HOME, `pwd` & 5 > 3 (café)\nsecond line\ttab'

const MODE_HINTS: Record<EscapeMode, string> = {
  json: 'For pasting inside a JSON "…" string: quotes, backslashes and control characters become \\" \\\\ \\n …',
  html: 'For embedding in HTML: markup characters and non-ASCII become entities like &lt; &amp; &eacute;.',
  url: 'Percent-encoding via encodeURIComponent, for a query value or path segment.',
  'shell-single':
    "POSIX single quoting: everything is literal; embedded ' becomes '\\''. Safest for shell arguments.",
  'shell-double':
    'POSIX double quoting: \\ ` $ " are backslash-escaped; variables would not expand.',
  regex: 'Backslash-escapes every regex metacharacter so the text matches itself literally.',
}

export default function StringEscape() {
  const [mode, setMode] = useState<EscapeMode>('json')
  const [raw, setRaw] = useState('')
  const [escaped, setEscaped] = useState('')
  const [error, setError] = useState<string | null>(null)

  function updateRaw(value: string, nextMode = mode) {
    setRaw(value)
    setEscaped(escapeText(value, nextMode))
    setError(null)
  }

  function updateEscaped(value: string) {
    setEscaped(value)
    try {
      setRaw(unescapeText(value, mode))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not unescape this input.')
    }
  }

  return (
    <ToolLayout
      title="String escape / unescape"
      description="Escape text for embedding in JSON strings, HTML, URLs, shell quotes or regex literals, or peel the escaping back off. Edit either side; the other follows. Everything runs in your browser."
      badge="client-side"
    >
      <div role="tablist" aria-label="Mode" className="mb-2 flex flex-wrap gap-1">
        {MODES.map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value)
              updateRaw(raw, value)
            }}
            className={cx(
              'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              mode === value ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
            )}
          >
            {MODE_LABELS[value]}
          </button>
        ))}
      </div>
      <p className="mb-4 rounded-lg border border-line bg-soft p-3 text-xs text-muted">
        {MODE_HINTS[mode]}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="raw" className="text-xs font-semibold text-muted">
              Raw text
            </label>
            <CopyButton text={raw} />
          </div>
          <textarea
            id="raw"
            name="raw"
            value={raw}
            onChange={(event) => updateRaw(event.target.value)}
            placeholder="Type or paste plain text. The escaped form appears on the right…"
            spellCheck={false}
            className="h-64 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
          />
          <div>
            <Button variant="ghost" size="sm" onClick={() => updateRaw(SAMPLE)}>
              <Sparkles className="size-3.5" />
              Load sample
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between">
            <label htmlFor="escaped" className="text-xs font-semibold text-muted">
              Escaped ({MODE_LABELS[mode]})
            </label>
            <CopyButton text={escaped} />
          </div>
          <textarea
            id="escaped"
            name="escaped"
            value={escaped}
            onChange={(event) => updateEscaped(event.target.value)}
            placeholder="…or paste escaped text here to decode it on the left."
            spellCheck={false}
            className={cx(
              'h-64 w-full resize-y rounded-lg border p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:outline-none',
              error
                ? 'border-rose bg-rose-soft focus:border-rose'
                : 'border-line bg-card focus:border-pine',
            )}
          />
          {error && (
            <p role="alert" className="text-xs text-rose">
              {error} The raw side keeps its last good value.
            </p>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-faint">
        Nested escaping (e.g. JSON inside JSON) peels one layer per pass, so paste the result back
        into the escaped side to peel the next layer.
      </p>
    </ToolLayout>
  )
}
