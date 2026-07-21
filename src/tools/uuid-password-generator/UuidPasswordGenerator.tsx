import { useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import {
  entropyBits,
  generatePasswords,
  generateUlids,
  generateUuids,
  type PasswordOptions,
} from './generate'

type Kind = 'uuid' | 'ulid' | 'password'

const TABS: [Kind, string][] = [
  ['uuid', 'UUID v4'],
  ['ulid', 'ULID'],
  ['password', 'Password'],
]

const MAX_COUNT = 1000

const CLASS_TOGGLES: [keyof PasswordOptions, string][] = [
  ['lower', 'a–z'],
  ['upper', 'A–Z'],
  ['digits', '0–9'],
  ['symbols', '!@#$%…'],
]

function clamp(value: number, min: number, max: number): number {
  return Number.isNaN(value) ? min : Math.min(max, Math.max(min, Math.trunc(value)))
}

function strength(bits: number): { label: string; tone: string } {
  if (bits < 50) return { label: 'weak', tone: 'text-rose' }
  if (bits < 80) return { label: 'fair', tone: 'text-ink' }
  return { label: 'strong', tone: 'text-pine' }
}

export default function UuidPasswordGenerator() {
  const [kind, setKind] = useState<Kind>('uuid')
  const [count, setCount] = useState(5)
  const [options, setOptions] = useState<PasswordOptions>({
    length: 20,
    lower: true,
    upper: true,
    digits: true,
    symbols: true,
    excludeAmbiguous: false,
  })
  const [items, setItems] = useState<string[]>(() => generateUuids(5))
  const [error, setError] = useState<string | null>(null)

  function generate(nextKind = kind, nextCount = count, nextOptions = options) {
    setError(null)
    try {
      if (nextKind === 'uuid') setItems(generateUuids(nextCount))
      else if (nextKind === 'ulid') setItems(generateUlids(nextCount))
      else setItems(generatePasswords(nextCount, nextOptions))
    } catch (cause) {
      setItems([])
      setError(cause instanceof Error ? cause.message : 'Generation failed.')
    }
  }

  const bits = entropyBits(options)
  const grade = strength(bits)

  return (
    <ToolLayout
      title="UUID / ULID / password generator"
      description="Generate UUID v4s, sortable ULIDs, or random passwords with configurable character classes and an entropy readout — powered exclusively by the browser's cryptographic random generator."
      badge="client-side"
    >
      <div role="tablist" aria-label="Generator" className="mb-4 flex gap-1">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={kind === value}
            onClick={() => {
              setKind(value)
              generate(value)
            }}
            className={cx(
              'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              kind === value ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line bg-soft p-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          How many (1–{MAX_COUNT})
          <input
            name="count"
            type="number"
            min={1}
            max={MAX_COUNT}
            value={count}
            onChange={(event) => setCount(clamp(event.target.valueAsNumber, 1, MAX_COUNT))}
            className="w-28 rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink tabular-nums focus:border-pine focus:outline-none"
          />
        </label>

        {kind === 'password' && (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Length (4–128)
              <input
                name="length"
                type="number"
                min={4}
                max={128}
                value={options.length}
                onChange={(event) =>
                  setOptions({ ...options, length: clamp(event.target.valueAsNumber, 4, 128) })
                }
                className="w-28 rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink tabular-nums focus:border-pine focus:outline-none"
              />
            </label>
            <fieldset className="flex flex-wrap items-center gap-3 pb-1.5">
              <legend className="sr-only">Character classes</legend>
              {CLASS_TOGGLES.map(([key, label]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-1.5 font-mono text-xs font-medium text-muted"
                >
                  <input
                    type="checkbox"
                    name={key}
                    checked={options[key] as boolean}
                    onChange={(event) => setOptions({ ...options, [key]: event.target.checked })}
                    className="accent-pine"
                  />
                  {label}
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted">
                <input
                  type="checkbox"
                  name="excludeAmbiguous"
                  checked={options.excludeAmbiguous}
                  onChange={(event) =>
                    setOptions({ ...options, excludeAmbiguous: event.target.checked })
                  }
                  className="accent-pine"
                />
                exclude ambiguous (<span className="font-mono">0O1lI</span>)
              </label>
            </fieldset>
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          {kind === 'password' && (
            <span className="text-xs text-muted">
              entropy{' '}
              <span className={cx('font-semibold tabular-nums', grade.tone)}>
                ≈ {Math.round(bits)} bits · {grade.label}
              </span>
            </span>
          )}
          <Button onClick={() => generate()}>
            <RefreshCw className="size-4" />
            Generate
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-line bg-rose-soft p-3 text-sm text-rose"
        >
          {error}
        </p>
      )}

      {items.length > 0 && (
        <section aria-labelledby="results-heading">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 id="results-heading" className="mr-auto text-sm font-semibold text-ink">
              Results <span className="font-normal text-muted">({items.length})</span>
            </h2>
            <CopyButton text={() => items.join('\n')} label="Copy all" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                downloadBlob(
                  new Blob([items.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' }),
                  `${kind}s.txt`,
                )
              }
            >
              <Download className="size-3.5" />
              Download .txt
            </Button>
          </div>
          <ul className="max-h-96 divide-y divide-line overflow-auto rounded-lg border border-line bg-card">
            {items.map((item, index) => (
              <li key={index} className="flex items-center gap-2 px-3 py-1.5">
                <span className="w-10 shrink-0 text-right font-mono text-[11px] text-faint tabular-nums">
                  {index + 1}
                </span>
                <code className="min-w-0 grow font-mono text-xs break-all text-ink">{item}</code>
                <CopyButton text={item} label="" aria-label={`Copy item ${index + 1}`} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </ToolLayout>
  )
}
