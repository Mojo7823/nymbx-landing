import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import {
  ALGORITHM_LABELS,
  ALGORITHM_ORDER,
  LEGACY_ALGORITHMS,
  hashText,
  hmacText,
  normalizeExpected,
  type AlgorithmId,
  type KeyFormat,
  type OutputFormat,
} from './hash'

type Mode = 'hash' | 'hmac'

const SAMPLE = 'The quick brown fox jumps over the lazy dog'

const MODE_LABELS: Record<Mode, string> = { hash: 'Hash', hmac: 'HMAC' }
const OUTPUT_LABELS: Record<OutputFormat, string> = { hex: 'Hex', base64: 'Base64' }
const KEY_FORMAT_LABELS: Record<KeyFormat, string> = { text: 'Text key', hex: 'Hex key' }

function Tabs<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string
  options: readonly T[]
  labels: Record<T, string>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option}
          role="tab"
          aria-selected={value === option}
          onClick={() => onChange(option)}
          className={cx(
            'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
            value === option ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
          )}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

export default function TextHasher() {
  const [text, setText] = useState('')
  const [algorithm, setAlgorithm] = useState<AlgorithmId>('sha256')
  const [mode, setMode] = useState<Mode>('hash')
  const [key, setKey] = useState('')
  const [keyFormat, setKeyFormat] = useState<KeyFormat>('text')
  const [output, setOutput] = useState<OutputFormat>('hex')
  const [expected, setExpected] = useState('')
  const [digest, setDigest] = useState('')
  const [error, setError] = useState<string | null>(null)

  const debouncedText = useDebouncedValue(text, 150)
  const debouncedKey = useDebouncedValue(key, 150)

  useEffect(() => {
    let stale = false
    async function compute() {
      if (debouncedText === '') {
        setDigest('')
        setError(null)
        return
      }
      try {
        const value =
          mode === 'hash'
            ? await hashText(debouncedText, algorithm, output)
            : await hmacText(debouncedText, algorithm, debouncedKey, keyFormat, output)
        if (!stale) {
          setDigest(value)
          setError(null)
        }
      } catch (cause) {
        if (!stale) {
          setDigest('')
          setError(cause instanceof Error ? cause.message : 'Hashing failed.')
        }
      }
    }
    void compute()
    return () => {
      stale = true
    }
  }, [debouncedText, debouncedKey, algorithm, mode, keyFormat, output])

  const expectedNorm = normalizeExpected(expected, output)
  const isMatch = expectedNorm !== '' && digest !== '' && digest === expectedNorm
  const resultKind = mode === 'hmac' ? 'HMAC' : 'digest'

  return (
    <ToolLayout
      title="Text hasher + HMAC"
      description="Hash text with SHA-2, SHA-3 or BLAKE3 (plus legacy MD5/SHA-1), or authenticate it with an HMAC key. Input is always encoded as UTF-8. Everything runs in your browser; nothing is sent anywhere."
      badge="client-side"
    >
      <Tabs
        label="Algorithm"
        options={ALGORITHM_ORDER}
        labels={ALGORITHM_LABELS}
        value={algorithm}
        onChange={setAlgorithm}
      />
      {LEGACY_ALGORITHMS.has(algorithm) && (
        <p className="mt-2 text-xs text-amber-badge">
          {ALGORITHM_LABELS[algorithm]} is legacy: fine for checksums, but not collision-resistant,
          so prefer SHA-256 or better for anything security-related.
        </p>
      )}

      <div className="mt-3 mb-4 flex flex-wrap gap-x-8 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">Mode</span>
          <Tabs
            label="Mode"
            options={['hash', 'hmac'] as const}
            labels={MODE_LABELS}
            value={mode}
            onChange={setMode}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">Output</span>
          <Tabs
            label="Output format"
            options={['hex', 'base64'] as const}
            labels={OUTPUT_LABELS}
            value={output}
            onChange={setOutput}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor="text" className="text-xs font-semibold text-muted">
            Text (hashed as UTF-8)
          </label>
          <textarea
            id="text"
            name="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type or paste text. The result updates live as you type…"
            spellCheck={false}
            className="h-44 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
          />
          <div>
            <Button variant="ghost" size="sm" onClick={() => setText(SAMPLE)}>
              <Sparkles className="size-3.5" />
              Load sample
            </Button>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {mode === 'hmac' && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="hmac-key" className="text-xs font-semibold text-muted">
                  HMAC key
                </label>
                <Tabs
                  label="Key format"
                  options={['text', 'hex'] as const}
                  labels={KEY_FORMAT_LABELS}
                  value={keyFormat}
                  onChange={setKeyFormat}
                />
              </div>
              <input
                id="hmac-key"
                type="text"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder={keyFormat === 'hex' ? 'Key bytes as hex, e.g. 0a1f2b…' : 'Secret key'}
                spellCheck={false}
                autoComplete="off"
                className="h-9 w-full rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink placeholder:text-faint focus:border-pine focus:outline-none"
              />
              {keyFormat === 'hex' && (
                <p className="text-xs text-faint">
                  Hex is decoded to raw bytes first: “abcd” means 0xAB 0xCD, not the four letters.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted">
                {MODE_LABELS[mode]} · {ALGORITHM_LABELS[algorithm]} · {OUTPUT_LABELS[output]}
              </span>
              <CopyButton text={digest} disabled={digest === ''} />
            </div>
            <div
              className={cx(
                'min-h-20 rounded-lg border p-3 font-mono text-xs leading-relaxed break-all',
                error ? 'border-rose bg-rose-soft' : 'border-line bg-card',
              )}
            >
              {error ? (
                <span role="alert" className="text-rose">
                  {error}
                </span>
              ) : digest ? (
                <span className="text-ink">{digest}</span>
              ) : (
                <span className="text-faint">
                  {text === '' ? 'The result appears here as you type.' : 'Computing…'}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="expected" className="text-xs font-semibold text-muted">
              Verify against an expected value
            </label>
            <input
              id="expected"
              type="text"
              value={expected}
              onChange={(event) => setExpected(event.target.value)}
              placeholder="Paste the expected digest to compare…"
              spellCheck={false}
              autoComplete="off"
              className="h-9 w-full rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink placeholder:text-faint focus:border-pine focus:outline-none"
            />
            {expectedNorm && (
              <p
                role="status"
                className={cx(
                  'font-mono text-xs',
                  isMatch ? 'text-pine' : 'text-red-600 dark:text-red-400',
                )}
              >
                {digest === ''
                  ? 'Enter text to compare'
                  : isMatch
                    ? `✓ Matches the computed ${ALGORITHM_LABELS[algorithm]} ${resultKind}`
                    : '✗ Does not match'}
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-faint">
        A hash is one-way: the only way to check it is to recompute. Hex output compares
        case-insensitively; base64 must match exactly.
      </p>
    </ToolLayout>
  )
}
