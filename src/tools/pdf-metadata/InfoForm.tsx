import { X } from 'lucide-react'
import { cx } from '../../lib/cx'
import { STANDARD_INFO_KEYS, type InfoEntry } from './types'

const DATE_KEYS = new Set<string>(['CreationDate', 'ModDate'])

const LABELS: Record<string, string> = {
  Title: 'Title',
  Author: 'Author',
  Subject: 'Subject',
  Keywords: 'Keywords',
  Creator: 'Creator (authoring app)',
  Producer: 'Producer (PDF writer)',
  CreationDate: 'Created',
  ModDate: 'Modified',
  Trapped: 'Trapped',
}

const inputClass =
  'h-9 w-full rounded-md border border-line-strong bg-card px-2 text-sm text-ink focus:border-pine focus:outline-none disabled:opacity-50'

export interface InfoFormProps {
  /** `null` when the file has no Info dictionary at all. */
  info: InfoEntry[] | null
  /** Editable value per standard key: text, `datetime-local` or Trapped name. */
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  /** Raw PDF strings of the date keys, shown under the inputs. */
  rawDates: Record<string, string>
  /** Date keys whose raw string could not be parsed. */
  badDates: string[]
  /** Custom keys the user marked for removal. */
  removedCustom: string[]
  onToggleCustom: (key: string) => void
  removeAll: boolean
  onToggleRemoveAll: (value: boolean) => void
  busy: boolean
}

export function InfoForm({
  info,
  values,
  onChange,
  rawDates,
  badDates,
  removedCustom,
  onToggleCustom,
  removeAll,
  onToggleRemoveAll,
  busy,
}: InfoFormProps) {
  const custom = (info ?? []).filter((entry) => !entry.standard)
  const disabled = removeAll || busy

  return (
    <section className="mb-4 rounded-lg border border-line bg-card p-4">
      <h2 className="text-sm font-semibold text-ink">Info dictionary</h2>
      <p className="mt-1 text-xs text-muted">
        {info === null
          ? 'This file has no Info dictionary. Typing in a field creates one.'
          : 'The classic metadata every PDF viewer shows in “Document properties”.'}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {STANDARD_INFO_KEYS.map((key) => {
          const raw = rawDates[key]
          const unparsable = badDates.includes(key)
          return (
            <label key={key} className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-muted">{LABELS[key]}</span>
              <span className="flex items-center gap-1.5">
                {key === 'Trapped' ? (
                  <select
                    value={values[key] ?? ''}
                    disabled={disabled}
                    onChange={(event) => onChange(key, event.target.value)}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    <option value="True">True</option>
                    <option value="False">False</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                ) : (
                  <input
                    type={DATE_KEYS.has(key) ? 'datetime-local' : 'text'}
                    step={DATE_KEYS.has(key) ? 1 : undefined}
                    value={values[key] ?? ''}
                    placeholder="not set"
                    disabled={disabled}
                    onChange={(event) => onChange(key, event.target.value)}
                    className={inputClass}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onChange(key, '')}
                  disabled={disabled || !values[key]}
                  aria-label={`Clear ${LABELS[key]}`}
                  className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-mint hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                >
                  <X className="size-3.5" />
                </button>
              </span>
              {raw && (
                <span
                  className={cx(
                    'font-mono text-[11px]',
                    unparsable ? 'text-amber-badge' : 'text-muted',
                  )}
                >
                  {raw}
                  {unparsable && ' · Unrecognised date format'}
                </span>
              )}
            </label>
          )
        })}
      </div>

      {custom.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="text-xs font-semibold text-ink">
            Custom keys ({custom.length}) — kept unless removed
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {custom.map((entry) => {
              const marked = removedCustom.includes(entry.key)
              return (
                <li key={entry.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={marked}
                      disabled={disabled}
                      onChange={() => onToggleCustom(entry.key)}
                      className="size-3.5 cursor-pointer accent-(--color-pine)"
                    />
                    Remove
                  </label>
                  <span
                    className={cx(
                      'min-w-0 font-mono text-xs break-all',
                      marked ? 'text-muted line-through' : 'text-ink',
                    )}
                  >
                    {entry.key} = {entry.value}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <label className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-xs text-ink">
        <input
          type="checkbox"
          checked={removeAll}
          disabled={busy}
          onChange={(event) => onToggleRemoveAll(event.target.checked)}
          className="size-3.5 cursor-pointer accent-(--color-pine)"
        />
        Remove the entire Info dictionary
      </label>
    </section>
  )
}
