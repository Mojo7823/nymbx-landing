import { cx } from '../../lib/cx'
import { encodingGroups, encodingName } from './encodings'
import type { Band, Candidate } from './detect'

const BAND_CLASSES: Record<Band, string> = {
  high: 'bg-mint text-pine',
  medium: 'bg-amber-soft text-amber-badge',
  low: 'bg-soft text-muted',
}

const BAND_LABELS: Record<Band, string> = { high: 'High', medium: 'Medium', low: 'Low' }

export interface CandidateListProps {
  candidates: Candidate[]
  selected: string | null
  onSelect: (label: string) => void
  /** Called when an encoding is chosen from the "Other encoding…" select. */
  onPick: (label: string) => void
  disabled?: boolean
}

export function CandidateList({
  candidates,
  selected,
  onSelect,
  onPick,
  disabled,
}: CandidateListProps) {
  return (
    <section className="rounded-lg border border-line bg-card p-3 sm:p-4">
      <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
        Detected encodings
      </h2>

      <ul className="mt-3 space-y-2" role="radiogroup" aria-label="Source encoding">
        {candidates.map((candidate, index) => {
          const active = candidate.label === selected
          return (
            <li key={candidate.label}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onSelect(candidate.label)}
                className={cx(
                  'w-full cursor-pointer rounded-md border p-3 text-left transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-pine focus-visible:outline-none',
                  'disabled:pointer-events-none disabled:opacity-60',
                  active
                    ? 'border-pine bg-mint/40'
                    : 'border-line bg-page hover:border-line-strong hover:bg-soft',
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-[11px] text-faint tabular-nums">{index + 1}</span>
                  <span className="text-sm font-semibold text-ink">
                    {encodingName(candidate.label)}
                  </span>
                  <span className="font-mono text-[11px] text-muted">{candidate.label}</span>
                  {candidate.valid ? (
                    <span
                      className={cx(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        BAND_CLASSES[candidate.band],
                      )}
                    >
                      {BAND_LABELS[candidate.band]}
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-soft px-2 py-0.5 text-[10px] font-semibold text-rose">
                      Invalid — {candidate.invalidSequences} undecodable sequence
                      {candidate.invalidSequences === 1 ? '' : 's'}
                    </span>
                  )}
                  {candidate.lang && (
                    <span className="text-[11px] text-faint">lang: {candidate.lang}</span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted">{candidate.reasons.join(' · ')}</p>
                <p className="mt-1.5 overflow-hidden font-mono text-xs text-ink text-ellipsis whitespace-nowrap max-sm:line-clamp-2 max-sm:whitespace-normal">
                  {candidate.preview || '(no printable text)'}
                </p>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="encoding-override" className="text-xs font-semibold text-muted">
          Other encoding…
        </label>
        <select
          id="encoding-override"
          value=""
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value) onPick(event.target.value)
          }}
          className="rounded-md border border-line bg-page px-2 py-1.5 text-xs text-ink focus:border-pine focus:outline-none disabled:opacity-60"
        >
          <option value="">Choose an encoding</option>
          {encodingGroups().map(({ group, encodings }) => (
            <optgroup key={group} label={group}>
              {encodings.map((encoding) => (
                <option key={encoding.label} value={encoding.label}>
                  {encoding.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </section>
  )
}
