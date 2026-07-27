import { useMemo, useState } from 'react'
import { ClipboardPaste, X } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { SplitPane } from '../../components/SplitPane'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { toast } from '../../lib/toast'
import { cx } from '../../lib/cx'
import { replaceDashes, type DashMode } from './emDash'

const modes: { id: DashMode; label: string; hint: string }[] = [
  { id: 'hyphen', label: 'Hyphen', hint: 'word — word  →  word - word' },
  { id: 'comma', label: 'Comma', hint: 'word — word  →  word, word' },
  { id: 'remove', label: 'Remove', hint: 'word — word  →  word word' },
]

const textareaClasses =
  'h-64 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-[13px] leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none sm:h-80'

export default function EmDashRemover() {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<DashMode>('hyphen')
  const [includeEnDash, setIncludeEnDash] = useState(false)

  const { output, count } = useMemo(
    () => replaceDashes(input, { mode, includeEnDash }),
    [input, mode, includeEnDash],
  )

  async function pasteFromClipboard() {
    try {
      setInput(await navigator.clipboard.readText())
    } catch {
      toast('Clipboard access was blocked. Paste into the text box instead.', {
        variant: 'error',
      })
    }
  }

  return (
    <ToolLayout
      title="Em-dash remover"
      description="Replace em-dashes (and optionally en-dashes) with a hyphen or comma, or remove them. Everything runs in your browser."
      badge="client-side"
    >
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <fieldset className="flex items-center gap-3">
          <legend className="sr-only">Replacement mode</legend>
          <span className="text-xs font-medium text-muted">Replace with</span>
          <div className="flex overflow-hidden rounded-md border border-line-strong">
            {modes.map((m) => (
              <label
                key={m.id}
                title={m.hint}
                className={cx(
                  'cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors not-first:border-l not-first:border-line',
                  mode === m.id ? 'bg-pine text-page' : 'bg-card text-muted hover:bg-mint',
                )}
              >
                <input
                  type="radio"
                  name="dash-mode"
                  value={m.id}
                  checked={mode === m.id}
                  onChange={() => setMode(m.id)}
                  className="sr-only"
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted">
          <input
            id="emdash-endash"
            type="checkbox"
            checked={includeEnDash}
            onChange={(e) => setIncludeEnDash(e.target.checked)}
            className="size-3.5 accent-(--color-pine)"
          />
          Also replace en-dashes (–)
        </label>
      </div>

      <SplitPane
        label="Resize input and result panels"
        first={
          <section aria-label="Input text">
            <div className="mb-2 flex h-8 items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Input</h2>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={pasteFromClipboard}>
                  <ClipboardPaste className="size-3.5" />
                  Paste
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setInput('')} disabled={!input}>
                  <X className="size-3.5" />
                  Clear
                </Button>
              </div>
            </div>
            <textarea
              id="emdash-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste your text here. The result appears instantly."
              aria-label="Text to process"
              autoFocus
              spellCheck={false}
              className={textareaClasses}
            />
          </section>
        }
        second={
          <section aria-label="Result text">
            <div className="mb-2 flex h-8 items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Result</h2>
              <CopyButton text={output} disabled={!output} />
            </div>
            <textarea
              id="emdash-output"
              value={output}
              readOnly
              placeholder="The cleaned text shows up here."
              aria-label="Processed text"
              spellCheck={false}
              className={cx(textareaClasses, 'bg-page')}
            />
          </section>
        }
      />

      <p aria-live="polite" className="mt-4 font-mono text-xs text-muted tabular-nums">
        {input === ''
          ? 'Waiting for input.'
          : count === 0
            ? 'No em-dashes found.'
            : `${count} ${count === 1 ? 'dash' : 'dashes'} ${mode === 'remove' ? 'removed' : 'replaced'}.`}
      </p>
    </ToolLayout>
  )
}
