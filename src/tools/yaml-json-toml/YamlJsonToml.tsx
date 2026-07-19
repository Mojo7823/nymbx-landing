import { useMemo, useRef, useState } from 'react'
import { Download, FileUp, FileWarning, Info, Sparkles } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import {
  FORMAT_LABELS,
  detectAndParse,
  stringifyAs,
  type ConvertError,
  type Format,
} from './convert'

const SAMPLE = `# Deployment config — comments are lost on conversion
defaults: &defaults
  retries: 3
  timeout: 30
  verbose: false

production:
  host: prod.example.com
  settings: *defaults

staging:
  host: staging.example.com
  settings: *defaults

released: 2026-01-15T08:30:00Z
replicas: 4
`

const EXT: Record<Format, string> = { json: 'json', yaml: 'yaml', toml: 'toml' }
const MIME: Record<Format, string> = {
  json: 'application/json',
  yaml: 'application/yaml',
  toml: 'application/toml',
}

function ErrorLine({ label, error }: { label?: string; error: ConvertError }) {
  return (
    <p className="text-sm text-red-600 dark:text-red-400">
      {label && <span className="font-semibold">{label}: </span>}
      {error.message}
      {error.line !== undefined && (
        <span className="font-mono text-xs">
          {' '}
          — line {error.line}
          {error.col !== undefined && `, column ${error.col}`}
        </span>
      )}
    </p>
  )
}

export default function YamlJsonToml() {
  const [text, setText] = useState('')
  const [target, setTarget] = useState<Format>('json')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const debounced = useDebouncedValue(text, 300)

  const conversion = useMemo(() => {
    if (!debounced.trim()) return null
    const detected = detectAndParse(debounced)
    if (detected.format === null) return { detected, result: null }
    return { detected, result: stringifyAs(detected.value, target) }
  }, [debounced, target])

  async function openFile(file: File | undefined) {
    if (!file) return
    setText(await file.text())
  }

  const detectedFormat = conversion?.detected.format ?? null
  const result = conversion?.result ?? null

  return (
    <ToolLayout
      title="YAML ↔ JSON ↔ TOML"
      description="Convert between the three config formats with auto-detected input. Everything stays in your browser."
      badge="client-side"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
          <FileUp className="size-3.5" />
          Open file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.yaml,.yml,.toml,application/json,text/plain"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void openFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <Button variant="ghost" size="sm" onClick={() => setText(SAMPLE)}>
          <Sparkles className="size-3.5" />
          Load sample
        </Button>
        {detectedFormat && (
          <span
            className="ml-auto rounded-full bg-mint px-2.5 py-1 font-mono text-[11px] font-semibold text-pine"
            role="status"
          >
            Detected: {FORMAT_LABELS[detectedFormat]}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste JSON, YAML or TOML here — the format is detected automatically…"
          aria-label="Input"
          spellCheck={false}
          className="h-64 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none lg:h-96 lg:w-1/2"
        />

        <div className="flex w-full flex-col gap-2 lg:w-1/2">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Output format"
              className="flex gap-1 rounded-md border border-line bg-card p-1"
            >
              {(['json', 'yaml', 'toml'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={target === f}
                  onClick={() => setTarget(f)}
                  className={cx(
                    'cursor-pointer rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    target === f ? 'bg-mint text-pine' : 'text-muted hover:text-ink',
                  )}
                >
                  {FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
            {result?.ok && result.output !== undefined && (
              <>
                <CopyButton text={result.output} />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadBlob(
                      new Blob([result.output ?? ''], { type: MIME[target] }),
                      `converted.${EXT[target]}`,
                    )
                  }
                >
                  <Download className="size-3.5" />
                  Download
                </Button>
              </>
            )}
          </div>

          {conversion === null ? (
            <p className="flex flex-1 items-center justify-center rounded-lg border border-line bg-card p-6 text-center text-xs text-faint">
              The converted output appears here.
            </p>
          ) : detectedFormat === null ? (
            <div
              role="alert"
              className="flex flex-col gap-1.5 rounded-lg border border-line bg-card p-4"
            >
              <p className="mb-1 text-sm font-medium text-ink">
                The input is not valid JSON, TOML or YAML:
              </p>
              {conversion.detected.format === null &&
                (['json', 'toml', 'yaml'] as const).map((f) => (
                  <ErrorLine
                    key={f}
                    label={FORMAT_LABELS[f]}
                    error={
                      (conversion.detected as { errors: Record<Format, ConvertError> }).errors[f]
                    }
                  />
                ))}
            </div>
          ) : result && !result.ok ? (
            <div role="alert" className="rounded-lg border border-line bg-card p-4">
              <ErrorLine error={{ message: result.error ?? 'Conversion failed.' }} />
            </div>
          ) : (
            <pre className="max-h-96 min-h-32 flex-1 overflow-auto rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre text-ink">
              {result?.output}
            </pre>
          )}

          {result?.warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5 text-xs text-amber-badge" role="status">
              <FileWarning className="mt-0.5 size-3.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Comments and original formatting are not preserved — conversion works on the parsed data.
        YAML anchors and aliases are expanded into plain values.
      </p>
    </ToolLayout>
  )
}
