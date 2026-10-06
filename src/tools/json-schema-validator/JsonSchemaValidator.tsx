import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Download, FileWarning, Play, Sparkles, Square, Trash2 } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { FileDropzone } from '../../components/FileDropzone'
import { ProgressBar } from '../../components/ProgressBar'
import { downloadBlob } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { wrapWorker } from '../../lib/worker'
import type { WorkerHandle } from '../../lib/worker'
import { MAX_INPUT_BYTES } from './model'
import type { Draft, ValidationResult } from './model'
import type { SchemaWorkerApi } from './schema.worker'

type Field = 'schema' | 'instance'
type Notice = { kind: 'error' | 'info'; text: string }
interface ActiveRun {
  worker: WorkerHandle<SchemaWorkerApi>
  timer: number | undefined
  removeListeners: () => void
}

const DEADLINE_MS = 15_000
const DRAFT_LABELS: Record<Draft, string> = {
  auto: 'Auto (from $schema; otherwise draft-07)',
  'draft-07': 'Draft-07',
  '2019-09': '2019-09',
  '2020-12': '2020-12',
}
const EDITORS: Record<Field, { label: string; placeholder: string }> = {
  schema: { label: 'JSON Schema', placeholder: 'Paste a JSON Schema object or boolean here…' },
  instance: { label: 'JSON document', placeholder: 'Paste any JSON value to validate here…' },
}
const FIELDS: Field[] = ['schema', 'instance']
const SAMPLE_SCHEMA = JSON.stringify(
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Project',
    type: 'object',
    required: ['name', 'maintainer', 'tags'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1 },
      maintainer: { $ref: '#/$defs/contact' },
      tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    },
    $defs: {
      contact: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
        additionalProperties: false,
      },
    },
  },
  null,
  2,
)
const SAMPLE_INSTANCE = JSON.stringify(
  {
    name: 'NYMBX Toolbox',
    maintainer: { email: 'hello@example.com' },
    tags: ['local', 'private'],
  },
  null,
  2,
)

function disposeRun(run: ActiveRun) {
  window.clearTimeout(run.timer)
  run.removeListeners()
  run.worker.terminate()
}

export default function JsonSchemaValidator() {
  const [inputs, setInputs] = useState<Record<Field, string>>({ schema: '', instance: '' })
  const [draft, setDraft] = useState<Draft>('auto')
  const [reading, setReading] = useState<Record<Field, string | null>>({
    schema: null,
    instance: null,
  })
  const [fileErrors, setFileErrors] = useState<Record<Field, string | null>>({
    schema: null,
    instance: null,
  })
  const [dropzoneVersion, setDropzoneVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const mounted = useRef(true)
  const readers = useRef<Record<Field, FileReader | null>>({ schema: null, instance: null })
  const activeRun = useRef<ActiveRun | null>(null)
  const bytes = useMemo(
    () => ({
      schema: new Blob([inputs.schema]).size,
      instance: new Blob([inputs.instance]).size,
    }),
    [inputs],
  )
  const isReading = reading.schema !== null || reading.instance !== null
  const oversized = bytes.schema > MAX_INPUT_BYTES || bytes.instance > MAX_INPUT_BYTES

  useEffect(() => {
    mounted.current = true
    const pendingReaders = readers.current
    return () => {
      mounted.current = false
      for (const field of FIELDS) {
        const reader = pendingReaders[field]
        pendingReaders[field] = null
        reader?.abort()
      }
      if (activeRun.current) {
        disposeRun(activeRun.current)
        activeRun.current = null
      }
    }
  }, [])

  function invalidateResult() {
    setResult(null)
    setNotice(null)
  }

  function cancelRead(field: Field) {
    const reader = readers.current[field]
    readers.current[field] = null
    reader?.abort()
    setReading((previous) => ({ ...previous, [field]: null }))
  }

  function changeText(field: Field, text: string) {
    if (activeRun.current) return
    cancelRead(field)
    setInputs((previous) => ({ ...previous, [field]: text }))
    setFileErrors((previous) => ({ ...previous, [field]: null }))
    invalidateResult()
  }

  function rejectFile(field: Field, files: File[]) {
    if (!mounted.current || activeRun.current) return
    cancelRead(field)
    invalidateResult()
    const tooLarge = files.some((file) => file.size > MAX_INPUT_BYTES)
    setFileErrors((previous) => ({
      ...previous,
      [field]: tooLarge
        ? 'File exceeds the 2 MiB limit. Previous editor contents were kept.'
        : 'Choose a JSON or plain-text file. Previous editor contents were kept.',
    }))
  }

  function openFile(field: Field, file: File | undefined) {
    if (!file || !mounted.current || activeRun.current) return
    if (file.size > MAX_INPUT_BYTES) {
      rejectFile(field, [file])
      return
    }
    cancelRead(field)
    invalidateResult()
    setFileErrors((previous) => ({ ...previous, [field]: null }))
    const reader = new FileReader()
    readers.current[field] = reader
    setReading((previous) => ({ ...previous, [field]: file.name }))
    const fail = () => {
      if (!mounted.current || readers.current[field] !== reader) return
      readers.current[field] = null
      setReading((previous) => ({ ...previous, [field]: null }))
      setFileErrors((previous) => ({
        ...previous,
        [field]: `Could not read ${file.name}. Previous editor contents were kept. Try choosing the file again.`,
      }))
    }
    reader.onload = () => {
      if (!mounted.current || readers.current[field] !== reader) return
      if (typeof reader.result !== 'string') {
        fail()
        return
      }
      const text = reader.result
      readers.current[field] = null
      setReading((previous) => ({ ...previous, [field]: null }))
      if (new Blob([text]).size > MAX_INPUT_BYTES) {
        setFileErrors((previous) => ({
          ...previous,
          [field]: 'Decoded text exceeds the 2 MiB limit. Previous editor contents were kept.',
        }))
        return
      }
      setInputs((previous) => ({ ...previous, [field]: text }))
      invalidateResult()
    }
    reader.onerror = fail
    reader.onabort = fail
    try {
      reader.readAsText(file)
    } catch {
      fail()
    }
  }

  function replaceInputs(sample: boolean) {
    if (activeRun.current) return
    for (const field of FIELDS) cancelRead(field)
    setInputs(
      sample ? { schema: SAMPLE_SCHEMA, instance: SAMPLE_INSTANCE } : { schema: '', instance: '' },
    )
    setFileErrors({ schema: null, instance: null })
    setDraft('auto')
    setDropzoneVersion((previous) => previous + 1)
    invalidateResult()
  }

  function finishRun(
    run: ActiveRun,
    nextResult: ValidationResult | null,
    nextNotice: Notice | null,
  ) {
    if (!mounted.current || activeRun.current !== run) return
    activeRun.current = null
    disposeRun(run)
    setBusy(false)
    setResult(nextResult)
    setNotice(nextNotice)
  }

  function validate() {
    if (activeRun.current || readers.current.schema || readers.current.instance || oversized) return
    if (!inputs.schema.trim() || !inputs.instance.trim()) return
    invalidateResult()
    setBusy(true)
    let run: ActiveRun | null = null
    try {
      const rawWorker = new Worker(new URL('./schema.worker.ts', import.meta.url), {
        type: 'module',
      })
      const worker = wrapWorker<SchemaWorkerApi>(rawWorker)
      const current: ActiveRun = {
        worker,
        timer: undefined,
        removeListeners: () => {
          rawWorker.removeEventListener('error', onFailure)
          rawWorker.removeEventListener('messageerror', onFailure)
        },
      }
      run = current
      activeRun.current = current
      const onFailure = () =>
        finishRun(current, null, {
          kind: 'error',
          text: 'The validation worker could not complete the request. Try validating again.',
        })
      rawWorker.addEventListener('error', onFailure)
      rawWorker.addEventListener('messageerror', onFailure)
      current.timer = window.setTimeout(
        () =>
          finishRun(current, null, {
            kind: 'error',
            text: 'Validation exceeded the 15-second time limit and was stopped. Simplify the schema or document, then try again.',
          }),
        DEADLINE_MS,
      )
      void worker.api
        .validate(inputs.schema, inputs.instance, draft)
        .then((nextResult) => finishRun(current, nextResult, null), onFailure)
    } catch {
      const failure: Notice = {
        kind: 'error',
        text: 'Could not start validation in this browser. Try validating again.',
      }
      if (run) finishRun(run, null, failure)
      else {
        setBusy(false)
        setNotice(failure)
      }
    }
  }

  const report = useMemo(
    () => (result ? JSON.stringify({ selectedDraft: draft, ...result }, null, 2) : ''),
    [draft, result],
  )
  const issues = result?.errors ?? []
  const remainingErrors = result?.ok ? Math.max(0, result.totalErrors - issues.length) : 0

  return (
    <ToolLayout
      title="JSON Schema validator"
      description="Check a JSON document against a JSON Schema, with exact error paths. Validation runs locally in a disposable worker; your schema and document never leave this browser."
      badge="client-side"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label htmlFor="schema-draft" className="text-xs font-medium text-muted">
          Schema draft
        </label>
        <select
          id="schema-draft"
          value={draft}
          disabled={busy || isReading}
          onChange={(event) => {
            setDraft(event.target.value as Draft)
            invalidateResult()
          }}
          className="h-9 max-w-full rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none disabled:opacity-50"
        >
          {Object.entries(DRAFT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || isReading}
          onClick={() => replaceInputs(true)}
        >
          <Sparkles className="size-3.5" aria-hidden /> Load sample
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => replaceInputs(false)}>
          <Trash2 className="size-3.5" aria-hidden /> Clear
        </Button>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        {FIELDS.map((field) => (
          <section key={field} aria-labelledby={`${field}-heading`} className="min-w-0 break-words">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 id={`${field}-heading`} className="text-sm font-semibold text-ink">
                <label htmlFor={`${field}-editor`}>{EDITORS[field].label}</label>
              </h2>
              <span className="font-mono text-[11px] text-muted">
                {formatBytes(bytes[field])} / 2 MiB
              </span>
            </div>
            <textarea
              id={`${field}-editor`}
              aria-label={EDITORS[field].label}
              value={inputs[field]}
              disabled={busy}
              onChange={(event) => changeText(field, event.target.value)}
              placeholder={EDITORS[field].placeholder}
              aria-describedby={`${field}-help ${field}-status`}
              aria-invalid={bytes[field] > MAX_INPUT_BYTES || undefined}
              spellCheck={false}
              className="h-72 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none disabled:opacity-60 lg:h-96"
            />
            <p id={`${field}-help`} className="mt-1 text-xs leading-relaxed text-muted">
              Paste JSON or open a UTF-8 file (maximum 2 MiB). Typing replaces any pending file
              import.
            </p>
            <div id={`${field}-status`} className="my-2" aria-live="polite">
              {reading[field] && (
                <ProgressBar label={`Reading ${EDITORS[field].label}: ${reading[field]}`} />
              )}
              {fileErrors[field] && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                  {fileErrors[field]}
                </p>
              )}
              {bytes[field] > MAX_INPUT_BYTES && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                  {EDITORS[field].label} exceeds the 2 MiB limit. Shorten the input before
                  validating.
                </p>
              )}
            </div>
            <div
              inert={busy}
              aria-disabled={busy || undefined}
              className={busy ? 'opacity-50' : undefined}
            >
              <FileDropzone
                key={`${field}-${dropzoneVersion}`}
                accept=".json,.schema,.txt,application/json,application/schema+json,text/plain"
                maxSize={MAX_INPUT_BYTES}
                hint={`${EDITORS[field].label} · JSON / text · up to 2 MiB`}
                onFiles={(files) => openFile(field, files[0])}
                onReject={(files) => rejectFile(field, files)}
              />
            </div>
          </section>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          onClick={validate}
          disabled={
            busy || isReading || oversized || !inputs.schema.trim() || !inputs.instance.trim()
          }
        >
          <Play className="size-4" aria-hidden /> Validate JSON
        </Button>
        {busy && (
          <Button
            variant="secondary"
            onClick={() => {
              const run = activeRun.current
              if (run)
                finishRun(run, null, {
                  kind: 'info',
                  text: 'Validation cancelled. You can edit the inputs or validate again.',
                })
            }}
          >
            <Square className="size-4" aria-hidden /> Cancel
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Remote references are not downloaded: inline them using $defs or definitions. Unsupported
        keywords and formats are rejected. Ordinary JavaScript number precision applies. Validation
        never changes your data and stops after 15 seconds.
      </p>

      <div className="mt-5" aria-live="polite" aria-atomic="true">
        {busy && <ProgressBar label="Validating schema and JSON document…" />}
        {notice && (
          <p
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={
              notice.kind === 'error'
                ? 'text-sm text-red-600 dark:text-red-400'
                : 'text-sm text-muted'
            }
          >
            {notice.text}
          </p>
        )}
        {!busy && !result && !notice && (
          <p className="text-sm text-muted">
            Enter a schema and a JSON document, or load the sample, then choose Validate JSON.
          </p>
        )}
        {result && (
          <div
            role={result.ok && result.valid ? 'status' : 'alert'}
            className="flex items-start gap-2 rounded-lg border border-line bg-card p-4"
          >
            {result.ok && result.valid ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-pine" aria-hidden />
            ) : (
              <FileWarning
                className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1 break-words">
              <h2 className="text-sm font-semibold text-ink">
                {result.ok
                  ? result.valid
                    ? 'Valid JSON document'
                    : `Validation failed: ${result.totalErrors} ${result.totalErrors === 1 ? 'error' : 'errors'}`
                  : result.source === 'schema'
                    ? 'Schema error'
                    : 'JSON document error'}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {result.ok ? `Validated with ${DRAFT_LABELS[result.draft]}.` : result.message}
              </p>
              {!result.ok && (
                <p className="mt-1 text-xs text-muted">
                  Selected draft: {DRAFT_LABELS[draft]}. Validation did not complete.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {result && (
        <section aria-label="Validation report" className="mt-4 min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CopyButton text={report} label="Copy report" />
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                downloadBlob(
                  new Blob([report], { type: 'application/json' }),
                  'json-schema-validation-report.json',
                )
              }
            >
              <Download className="size-3.5" aria-hidden /> Download report
            </Button>
          </div>
          {issues.length > 0 && (
            <>
              <p className="mb-2 text-xs text-muted">
                Paths are JSON Pointers; <code>""</code> is the root. Schema errors refer to the
                schema being checked.
              </p>
              <ol className="space-y-3" aria-label="Validation errors">
                {issues.map((issue, index) => (
                  <li key={index} className="rounded-lg border border-line bg-card p-3">
                    <p className="text-sm font-medium break-words text-ink">
                      {index + 1}. {issue.message}
                    </p>
                    <dl className="mt-2 grid min-w-0 gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                      <dt className="text-muted">Instance pointer</dt>
                      <dd className="min-w-0 break-all font-mono text-ink">
                        {issue.instancePath === '' ? '"" (root)' : issue.instancePath}
                      </dd>
                      <dt className="text-muted">Schema pointer</dt>
                      <dd className="min-w-0 break-all font-mono text-ink">
                        {issue.schemaPath === '' ? '"" (root)' : issue.schemaPath}
                      </dd>
                      <dt className="text-muted">Keyword</dt>
                      <dd className="min-w-0 break-all font-mono text-ink">{issue.keyword}</dd>
                    </dl>
                  </li>
                ))}
              </ol>
            </>
          )}
          {remainingErrors > 0 && (
            <p className="mt-3 text-xs text-muted">
              Showing the first {issues.length} errors; {remainingErrors} more are not included in
              this report. The total count includes all validation errors.
            </p>
          )}
        </section>
      )}
    </ToolLayout>
  )
}
