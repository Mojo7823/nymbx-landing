import { Download, Wand2 } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { encodingGroups, encodingName, hasEncoder } from './encodings'
import type { Repair } from './mojibake'
import type { Suggestion } from './mojibake'

const AUTO = 'auto'

function EncodingSelect({
  id,
  label,
  value,
  onChange,
  encoderOnly,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  encoderOnly: boolean
}) {
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="text-xs font-semibold text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-md border border-line-strong bg-page px-2 py-1.5 text-xs text-ink focus:border-pine focus:outline-none"
      >
        <option value={AUTO}>Auto-detect</option>
        {encodingGroups().map(({ group, encodings }) => {
          const usable = encoderOnly ? encodings.filter((e) => hasEncoder(e.label)) : encodings
          if (usable.length === 0) return null
          return (
            <optgroup key={group} label={group}>
              {usable.map((encoding) => (
                <option key={encoding.label} value={encoding.label}>
                  {encoding.name}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
    </div>
  )
}

function LossNote({ result }: { result: Pick<Repair, 'lost' | 'replacements'> }) {
  const total = result.lost + result.replacements
  if (total === 0) return null
  return (
    <p className="mt-2 text-xs text-amber-badge">
      {total} character{total === 1 ? '' : 's'} could not be recovered — the original decoding
      discarded those bytes.
    </p>
  )
}

export interface RepairPanelProps {
  garbled: string
  onGarbledChange: (value: string) => void
  decodedAs: string
  onDecodedAsChange: (value: string) => void
  actual: string
  onActualChange: (value: string) => void
  busy: boolean
  result: Repair | null
  suggestions: Suggestion[] | null
  onUseSuggestion: (suggestion: Suggestion) => void
  onDownload: (text: string) => void
}

export function RepairPanel({
  garbled,
  onGarbledChange,
  decodedAs,
  onDecodedAsChange,
  actual,
  onActualChange,
  busy,
  result,
  suggestions,
  onUseSuggestion,
  onDownload,
}: RepairPanelProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-card p-3 sm:p-4">
        <label htmlFor="garbled-text" className="text-xs font-semibold text-muted">
          Garbled text
        </label>
        <textarea
          id="garbled-text"
          rows={8}
          value={garbled}
          onChange={(event) => onGarbledChange(event.target.value)}
          placeholder="e.g. Ã©tÃ© or 绻侀珨涓枃"
          spellCheck={false}
          className="mt-1.5 w-full resize-y rounded-md border border-line-strong bg-page p-3 font-mono text-xs text-ink placeholder:text-faint focus:border-pine focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-muted">
          Paste the mangled text · {[...garbled].length.toLocaleString()} characters
        </p>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <EncodingSelect
            id="repair-decoded-as"
            label="Was decoded as"
            value={decodedAs}
            onChange={onDecodedAsChange}
            encoderOnly
          />
          <EncodingSelect
            id="repair-actual"
            label="Actually is"
            value={actual}
            onChange={onActualChange}
            encoderOnly={false}
          />
        </div>
      </section>

      {busy && <ProgressBar label="Repairing…" />}

      {!busy && suggestions !== null && (
        <section className="rounded-lg border border-line bg-card p-3 sm:p-4">
          <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
            Suggestions
          </h2>
          {suggestions.length === 0 ? (
            <p className="mt-3 text-xs text-muted">
              No plausible wrong/right encoding pair was found for this text.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {suggestions.map((suggestion) => (
                <li key={`${suggestion.decodedAs}-${suggestion.actual}`}>
                  <button
                    type="button"
                    onClick={() => onUseSuggestion(suggestion)}
                    className={cx(
                      'w-full cursor-pointer rounded-md border border-line bg-page p-3 text-left transition-colors',
                      'hover:border-line-strong hover:bg-soft',
                      'focus-visible:ring-2 focus-visible:ring-pine focus-visible:outline-none',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {encodingName(suggestion.decodedAs)} → {encodingName(suggestion.actual)}
                      </span>
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          suggestion.confidence >= 80
                            ? 'bg-mint text-pine'
                            : suggestion.confidence >= 40
                              ? 'bg-amber-soft text-amber-badge'
                              : 'bg-soft text-muted',
                        )}
                      >
                        {suggestion.confidence >= 80
                          ? 'High'
                          : suggestion.confidence >= 40
                            ? 'Medium'
                            : 'Low'}
                      </span>
                    </div>
                    <p className="mt-1.5 overflow-hidden font-mono text-xs text-ink">
                      {[...suggestion.text].slice(0, 200).join('')}
                    </p>
                    {suggestion.lost + suggestion.replacements > 0 && (
                      <p className="mt-1 text-[11px] text-amber-badge">
                        {suggestion.lost + suggestion.replacements} characters could not be
                        recovered
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!busy && result && (
        <section className="rounded-lg border border-line bg-card p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
              Repaired text
            </h2>
            <div className="ml-auto flex gap-2">
              <CopyButton text={() => result.text} />
              <Button size="sm" variant="secondary" onClick={() => onDownload(result.text)}>
                <Download className="size-3.5" aria-hidden /> Download as UTF-8
              </Button>
            </div>
          </div>
          <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-line bg-page p-3 font-mono text-xs break-words whitespace-pre-wrap text-ink">
            {result.text}
          </pre>
          <LossNote result={result} />
        </section>
      )}

      {!busy && !result && suggestions === null && garbled.trim().length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Wand2 className="size-3.5" aria-hidden /> Choose the encodings above, or leave both on
          Auto-detect.
        </p>
      )}
    </div>
  )
}
