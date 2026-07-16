import { useMemo, useState } from 'react'
import { ClipboardPaste, X } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { SplitPane } from '../../components/SplitPane'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { toast } from '../../lib/toast'
import { cx } from '../../lib/cx'
import { collapseBlankLines, type BlankLineMode } from './collapseLines'

const modes: { id: BlankLineMode; label: string; hint: string }[] = [
  { id: 'one', label: 'Collapse to one', hint: 'Runs of blank lines become a single blank line' },
  { id: 'zero', label: 'Remove all', hint: 'Every blank line is removed' },
]

const textareaClasses =
  'h-64 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-[13px] leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none sm:h-80'

export default function DoubleLineRemover() {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<BlankLineMode>('one')
  const [trimTrailing, setTrimTrailing] = useState(false)

  const { output, linesBefore, linesAfter } = useMemo(
    () => collapseBlankLines(input, { mode, trimTrailing }),
    [input, mode, trimTrailing],
  )

  async function pasteFromClipboard() {
    try {
      setInput(await navigator.clipboard.readText())
    } catch {
      toast('Clipboard access was blocked — paste into the text box instead.', {
        variant: 'error',
      })
    }
  }

  return (
    <ToolLayout
      title="Double line remover"
      description="Collapse repeated blank lines to a single one, or remove them entirely. Whitespace-only lines count as blank. Everything runs in your browser."
      badge="client-side"
    >
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <fieldset className="flex items-center gap-3">
          <legend className="sr-only">Blank line handling</legend>
          <span className="text-xs font-medium text-muted">Blank lines</span>
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
                  name="blank-line-mode"
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
            id="dlr-trim"
            type="checkbox"
            checked={trimTrailing}
            onChange={(e) => setTrimTrailing(e.target.checked)}
            className="size-3.5 accent-(--color-pine)"
          />
          Trim trailing whitespace
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
              id="dlr-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste your text here — the result appears instantly."
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
              id="dlr-output"
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
          : linesBefore === linesAfter
            ? `${linesBefore} lines — nothing to collapse.`
            : `${linesBefore} lines → ${linesAfter} lines (${linesBefore - linesAfter} removed).`}
      </p>
    </ToolLayout>
  )
}
