import { useEffect, useId, useRef, useState } from 'react'
import { transfer } from 'comlink'
import { FileDown, RefreshCw, RotateCcw, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { FileDropzone } from '../../components/FileDropzone'
import { ProgressBar } from '../../components/ProgressBar'
import { SplitPane } from '../../components/SplitPane'
import { ToolLayout } from '../../components/ToolLayout'
import { downloadBlob } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { wrapWorker } from '../../lib/worker'
import type { WorkerHandle } from '../../lib/worker'
import type { FormWorkerApi } from './form.worker'
import type { FormField, FormSummary, FormValue } from './types'
import { PdfPreview } from './PdfPreview'

const MAX_SIZE = 50 * 1024 * 1024
const inputClass =
  'w-full min-w-0 rounded-md border border-line-strong bg-card px-3 py-2 text-sm text-ink disabled:opacity-60'

function FieldControl({
  field,
  value,
  disabled,
  onChange,
}: {
  field: FormField
  value: FormValue
  disabled: boolean
  onChange: (value: FormValue) => void
}) {
  const id = useId()
  const [customOption, setCustomOption] = useState('')
  const locked = disabled || field.readOnly
  const text = typeof value === 'string' ? value : ''
  const selected = Array.isArray(value) ? value : text ? [text] : []
  const options = [...new Set([...(field.options ?? []), ...selected])]
  const metadata = [field.required && 'Required', field.readOnly && 'Read-only', field.type]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="min-w-0 rounded-md border border-line p-3">
      <label htmlFor={id} className="block text-sm font-medium break-words text-ink">
        {field.label}
      </label>
      {field.label !== field.name && (
        <p className="mt-1 font-mono text-[11px] break-all text-muted">{field.name}</p>
      )}
      <p id={`${id}-hint`} className="mt-1 mb-2 text-[11px] text-muted">
        {metadata}
      </p>
      {field.type === 'text' ? (
        field.multiline ? (
          <textarea
            id={id}
            aria-describedby={`${id}-hint`}
            value={text}
            disabled={locked}
            maxLength={field.maxLength}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} resize-y`}
          />
        ) : (
          <input
            id={id}
            aria-describedby={`${id}-hint`}
            type={field.password ? 'password' : 'text'}
            value={text}
            disabled={locked}
            maxLength={field.maxLength}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass}
          />
        )
      ) : field.type === 'checkbox' ? (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            disabled={locked}
            onChange={(e) => onChange(e.target.checked)}
            aria-label={field.label}
            className="size-4 accent-pine"
          />
          Checked
        </label>
      ) : field.type === 'radio' ? (
        <fieldset aria-label={field.label} disabled={locked} className="space-y-2">
          {(field.options ?? []).map((option) => (
            <label key={option} className="flex items-start gap-2 text-sm break-words text-ink">
              <input
                type="radio"
                name={id}
                value={option}
                checked={text === option}
                onChange={() => onChange(option)}
                className="mt-0.5 size-4 shrink-0 accent-pine"
              />
              {option}
            </label>
          ))}
          <Button variant="ghost" size="sm" disabled={locked || !text} onClick={() => onChange('')}>
            Clear selection
          </Button>
        </fieldset>
      ) : field.type === 'dropdown' && field.editable && !field.multiselect ? (
        <>
          <input
            id={id}
            list={`${id}-options`}
            value={selected[0] ?? ''}
            disabled={locked}
            onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
            className={inputClass}
          />
          <datalist id={`${id}-options`}>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </>
      ) : field.type === 'dropdown' || field.type === 'list' ? (
        <>
          <select
            id={id}
            aria-describedby={`${id}-hint`}
            value={field.multiselect ? selected : (selected[0] ?? '')}
            multiple={field.multiselect}
            size={
              field.multiselect ? Math.min(Math.max(field.options?.length ?? 0, 3), 6) : undefined
            }
            disabled={locked}
            onChange={(e) =>
              onChange(
                Array.from(e.target.selectedOptions)
                  .map((option) => option.value)
                  .filter((option) => option !== ''),
              )
            }
            className={inputClass}
          >
            {!field.multiselect && <option value="">— No selection —</option>}
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {field.multiselect && (
            <Button
              variant="ghost"
              size="sm"
              disabled={locked || selected.length === 0}
              onClick={() => onChange([])}
            >
              Clear selection
            </Button>
          )}
          {field.editable && field.multiselect && (
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                aria-label={`Custom option for ${field.label}`}
                value={customOption}
                disabled={locked}
                onChange={(e) => setCustomOption(e.target.value)}
                className={inputClass}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={locked || !customOption}
                onClick={() => {
                  onChange([...new Set([...selected, customOption])])
                  setCustomOption('')
                }}
              >
                Add selection
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs break-words text-amber-badge">
          {field.reason ?? 'This field cannot be edited here.'}
        </p>
      )}
      {field.maxLength !== undefined && (
        <p className="mt-1 text-[11px] text-muted">Maximum {field.maxLength} characters</p>
      )}
    </div>
  )
}

export default function PdfFormFiller() {
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState<FormSummary | null>(null)
  const [values, setValues] = useState<Record<string, FormValue>>({})
  const [preview, setPreview] = useState<File | Uint8Array | null>(null)
  const [previewKind, setPreviewKind] = useState('Original PDF')
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultSize, setResultSize] = useState<number | null>(null)
  const workerRef = useRef<WorkerHandle<FormWorkerApi> | null>(null)
  const identity = useRef(0)
  const fontSent = useRef(false)
  const fetchRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      identity.current++
      workerRef.current?.terminate()
      fetchRef.current?.abort()
    },
    [],
  )

  function clear() {
    identity.current++
    workerRef.current?.terminate()
    workerRef.current = null
    fetchRef.current?.abort()
    fontSent.current = false
    setFile(null)
    setSummary(null)
    setValues({})
    setPreview(null)
    setStale(false)
    setBusy(null)
    setError(null)
    setResultSize(null)
  }

  async function open(files: File[]) {
    const picked = files[0]
    if (!picked) return
    clear()
    const token = identity.current
    setBusy('Reading form fields…')
    try {
      const buffer = await picked.arrayBuffer()
      if (token !== identity.current) return
      const handle = wrapWorker<FormWorkerApi>(
        new Worker(new URL('./form.worker.ts', import.meta.url), { type: 'module' }),
      )
      workerRef.current = handle
      const next = await handle.api.open(transfer(buffer, [buffer]))
      if (token !== identity.current) return
      setFile(picked)
      setSummary(next)
      setValues(Object.fromEntries(next.fields.map((field) => [field.name, field.value])))
      setPreview(picked)
      setPreviewKind('Original PDF')
    } catch (err) {
      if (token !== identity.current) return
      workerRef.current?.terminate()
      workerRef.current = null
      const message = err instanceof Error ? err.message : String(err)
      setError(
        /encrypted|password/i.test(message)
          ? 'This PDF is password-protected. Remove the password first; encrypted files are not supported.'
          : /XFA|signed|signature|form|field/i.test(message)
            ? message
            : 'Could not read this file as a PDF. It may be corrupted or not a PDF at all.',
      )
    } finally {
      if (token === identity.current) setBusy(null)
    }
  }

  function edit(name: string, value: FormValue) {
    setValues((current) => ({ ...current, [name]: value }))
    setStale(true)
    setError(null)
    setResultSize(null)
  }

  function reset() {
    if (!summary || !file) return
    setValues(Object.fromEntries(summary.fields.map((field) => [field.name, field.value])))
    setPreview(file)
    setPreviewKind('Original PDF')
    setStale(false)
    setError(null)
    setResultSize(null)
  }

  async function generate(flatten: boolean, download: boolean) {
    const handle = workerRef.current
    if (!file || !summary || !handle || busy) return
    const token = identity.current
    setBusy('Preparing PDF…')
    setError(null)
    try {
      let fontBytes: Uint8Array<ArrayBuffer> | undefined
      if (!fontSent.current) {
        setBusy('Loading the local PDF font…')
        const controller = new AbortController()
        fetchRef.current = controller
        const response = await fetch('/fonts/NotoSansTC-Regular.ttf', { signal: controller.signal })
        if (!response.ok) throw new Error('The PDF font could not load. Reconnect and try again.')
        fontBytes = new Uint8Array(await response.arrayBuffer())
      }
      if (token !== identity.current) return
      setBusy(flatten ? 'Flattening form fields…' : 'Updating form appearances…')
      const request = { values, flatten, fontBytes }
      const pending = handle.api.apply(fontBytes ? transfer(request, [fontBytes.buffer]) : request)
      fontSent.current = true
      const out = await pending
      if (token !== identity.current) return
      setPreview(out)
      setPreviewKind(
        flatten ? 'Flattened PDF — static field values' : 'Filled PDF — fields remain editable',
      )
      setStale(false)
      setResultSize(out.byteLength)
      if (download) {
        const base = file.name.replace(/\.pdf$/i, '')
        downloadBlob(
          new Blob([out as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
          `${base}.${flatten ? 'flattened' : 'filled'}.pdf`,
        )
      }
    } catch (err) {
      if (token !== identity.current) return
      setError(
        err instanceof Error ? err.message : 'Could not save this PDF. Your inputs are unchanged.',
      )
    } finally {
      if (token === identity.current) setBusy(null)
    }
  }

  const supported = summary?.fields.filter((field) => field.type !== 'unsupported').length ?? 0
  return (
    <ToolLayout workspace>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {!file && !busy && (
          <>
            <FileDropzone
              accept=".pdf,application/pdf"
              maxSize={MAX_SIZE}
              onFiles={(files) => void open(files)}
              hint="PDF with AcroForm fields · up to 50 MiB"
            />
            <p className="text-sm text-muted">
              Fill existing text fields, checkboxes and choices. Download an editable form or
              flatten its values into the page. XFA forms and encrypted or digitally signed PDFs are
              not supported.
            </p>
          </>
        )}
        {file && summary && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card p-3">
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <p className="text-sm font-medium break-all text-ink">{file.name}</p>
                <p className="mt-1 text-xs text-muted">
                  {formatBytes(file.size)} · {summary.pageCount}{' '}
                  {summary.pageCount === 1 ? 'page' : 'pages'} · {summary.fields.length}{' '}
                  {summary.fields.length === 1 ? 'field' : 'fields'}
                  {resultSize !== null ? ` · Output ${formatBytes(resultSize)}` : ''}
                </p>
              </div>
              <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={reset}>
                <RotateCcw className="size-4" />
                Reset values
              </Button>
              <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={clear}>
                <X className="size-4" />
                Change PDF
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={Boolean(busy) || supported === 0}
                onClick={() => void generate(false, false)}
              >
                <RefreshCw className="size-4" />
                Update preview
              </Button>
              <Button
                size="sm"
                disabled={Boolean(busy) || supported === 0}
                onClick={() => void generate(false, true)}
              >
                <FileDown className="size-4" />
                Download filled PDF
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={Boolean(busy) || supported === 0 || !summary.canFlatten}
                onClick={() => void generate(true, true)}
              >
                <FileDown className="size-4" />
                Download flattened PDF
              </Button>
            </div>
            <p className="text-xs text-muted">
              Downloads always use your current inputs. Flattening removes form editability, not
              underlying document content; it is not redaction. PDF scripts and calculated fields
              are not executed.
            </p>
            {summary.warnings.length > 0 && (
              <div
                role="status"
                className="rounded-md border border-line bg-amber-soft p-3 text-xs break-words text-amber-badge"
              >
                {summary.warnings.map((warning, i) => (
                  <p key={i}>{warning}</p>
                ))}
              </div>
            )}
            {!summary.canFlatten && (
              <p className="text-xs text-amber-badge">
                Flattening is unavailable because this PDF contains unsupported fields.
              </p>
            )}
          </>
        )}
        {busy && (
          <div className="flex items-center gap-3">
            <ProgressBar className="min-w-0 flex-1" label={busy} />
            {!file && (
              <Button variant="ghost" size="sm" onClick={clear}>
                Cancel
              </Button>
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-line bg-amber-soft p-3 text-sm break-words text-amber-badge"
          >
            {error}
          </p>
        )}
        {file && summary && preview && (
          <SplitPane
            className="min-h-[32rem] flex-1 lg:min-h-80"
            label="Resize form and preview"
            first={
              <section className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-card">
                <div className="border-b border-line p-3">
                  <h2 className="text-sm font-semibold text-ink">Form fields</h2>
                  <p className="mt-1 text-xs text-muted">
                    Required and read-only flags come from the PDF. Partial forms can still be
                    saved.
                  </p>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
                  {summary.fields.map((field) => (
                    <FieldControl
                      key={field.name}
                      field={field}
                      value={values[field.name] ?? field.value}
                      disabled={Boolean(busy)}
                      onChange={(value) => edit(field.name, value)}
                    />
                  ))}
                </div>
              </section>
            }
            second={
              <PdfPreview
                source={preview}
                caption={
                  stale ? 'Inputs changed — update preview to see current values' : previewKind
                }
              />
            }
          />
        )}
      </div>
    </ToolLayout>
  )
}
