import { useEffect, useId, useRef, useState } from 'react'
import type { ClipboardEvent } from 'react'
import { FileDown, KeyRound, RotateCcw, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { FileDropzone } from '../../components/FileDropzone'
import { ProgressBar } from '../../components/ProgressBar'
import { ToolLayout } from '../../components/ToolLayout'
import { downloadBlob } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { wrapWorker } from '../../lib/worker'
import { MAX_PDF_BYTES, SECURITY_ERROR_MESSAGES, validateSecurityOptions } from './security'
import type { SecurityWorkerApi } from './security.worker'
import type { PdfPermissions, SecurityOptions, SecurityResult } from './types'

const inputClass =
  'w-full min-w-0 rounded-md border border-line-strong bg-card px-3 py-2 text-sm text-ink disabled:opacity-60'
const STARTUP_ERROR = 'The local PDF engine could not start. Reload this page and try again.'
const DEFAULT_PERMISSIONS: PdfPermissions = { print: 'full', modify: 'all', extract: true }

interface Inputs {
  mode: SecurityOptions['mode']
  inputPassword: string
  userPassword: string
  ownerPassword: string
  permissions: PdfPermissions
}

const DEFAULT_INPUTS: Inputs = {
  mode: 'unlock',
  inputPassword: '',
  userPassword: '',
  ownerPassword: '',
  permissions: DEFAULT_PERMISSIONS,
}

interface Download {
  blob: Blob
  filename: string
  mode: SecurityOptions['mode']
  warnings: string[]
}

export default function PdfSecurity() {
  const id = useId()
  const [file, setFile] = useState<File | null>(null)
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<Download | null>(null)
  const identity = useRef(0)
  const stopWorker = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      identity.current++
      stopWorker.current?.()
      stopWorker.current = null
    },
    [],
  )

  function invalidate() {
    identity.current++
    stopWorker.current?.()
    stopWorker.current = null
    setBusy(false)
    setResult(null)
    setError(null)
    setNotice(null)
  }

  function change(next: Partial<Inputs>) {
    invalidate()
    setInputs((previous) => ({ ...previous, ...next }))
  }

  function reset(clearFile: boolean) {
    invalidate()
    setInputs(DEFAULT_INPUTS)
    if (clearFile) setFile(null)
  }

  function open(files: File[]) {
    const picked = files[0]
    if (!picked) return
    reset(true)
    if (picked.size > MAX_PDF_BYTES) {
      setError('Choose one PDF no larger than 50 MiB.')
      return
    }
    setFile(picked)
  }

  function checkPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData('text')
    if (pasted.includes('\0') || /[\r\n]/.test(pasted)) {
      event.preventDefault()
      invalidate()
      setError(
        pasted.includes('\0')
          ? SECURITY_ERROR_MESSAGES.PdfSecurityPasswordNul
          : 'These single-line password fields cannot accept line breaks. Nothing was pasted.',
      )
    }
  }

  async function process() {
    if (!file || busy) return
    invalidate()
    const options: SecurityOptions =
      inputs.mode === 'unlock'
        ? { mode: 'unlock', inputPassword: inputs.inputPassword }
        : { ...inputs, mode: 'protect' }
    const token = identity.current
    setBusy(true)
    let dispose: (() => void) | undefined
    try {
      validateSecurityOptions(options)
      const worker = new Worker(new URL('./security.worker.ts', import.meta.url), {
        type: 'module',
      })
      const handle = wrapWorker<SecurityWorkerApi>(worker)
      let rejectPending: (reason: Error) => void
      const onError = () => {
        rejectPending(new Error(STARTUP_ERROR))
      }
      let disposed = false
      dispose = () => {
        if (disposed) return
        disposed = true
        worker.removeEventListener('error', onError)
        worker.removeEventListener('messageerror', onError)
        handle.terminate()
      }
      const cleanup = dispose
      stopWorker.current = () => {
        cleanup()
        rejectPending(new Error('Cancelled'))
      }
      const pending = new Promise<SecurityResult>((resolve, reject) => {
        rejectPending = reject
        worker.addEventListener('error', onError)
        worker.addEventListener('messageerror', onError)
        void handle.api.process(file, options).then(resolve, reject)
      })
      const output = await pending
      if (token !== identity.current) return
      const suffix = options.mode === 'unlock' ? 'unlocked' : 'protected'
      setResult({
        blob: new Blob([output.bytes], { type: 'application/pdf' }),
        filename: `${file.name.replace(/\.pdf$/i, '')}.${suffix}.pdf`,
        mode: options.mode,
        warnings: output.warnings,
      })
    } catch (err) {
      if (token !== identity.current) return
      // Never render engine diagnostics: they may contain sensitive input or PDF content.
      const knownError =
        err instanceof Error &&
        Object.prototype.hasOwnProperty.call(SECURITY_ERROR_MESSAGES, err.name)
          ? SECURITY_ERROR_MESSAGES[err.name as keyof typeof SECURITY_ERROR_MESSAGES]
          : null
      setError(
        knownError ??
          (err instanceof Error && err.message === STARTUP_ERROR
            ? STARTUP_ERROR
            : 'Could not process this PDF. Check that it is a valid PDF and that the current password is correct, then try again.'),
      )
    } finally {
      dispose?.()
      if (token === identity.current) {
        stopWorker.current = null
        setBusy(false)
      }
    }
  }

  return (
    <ToolLayout workspace>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <p className="text-sm text-muted">
          Remove a known PDF password or protect a copy with AES-256 encryption. Processing stays in
          this browser; files and passwords are not uploaded or saved. Originals stay unchanged.
        </p>
        {!file ? (
          <FileDropzone
            accept=".pdf,application/pdf"
            maxSize={MAX_PDF_BYTES}
            onFiles={open}
            hint="One PDF · up to 50 MiB"
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card p-3">
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <p className="text-sm font-medium break-all text-ink">{file.name}</p>
              <p className="mt-1 text-xs text-muted">{formatBytes(file.size)} · Original PDF</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => reset(false)}>
              <RotateCcw className="size-4" />
              Reset settings
            </Button>
            <Button variant="ghost" size="sm" onClick={() => reset(true)}>
              <X className="size-4" />
              Change PDF
            </Button>
          </div>
        )}
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <form
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault()
              void process()
            }}
            className="min-w-0 space-y-4 rounded-lg border border-line bg-card p-3 sm:p-4"
          >
            <fieldset disabled={busy} className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-ink">PDF security</legend>
              <div className="flex flex-wrap gap-4">
                {(['unlock', 'protect'] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="radio"
                      name={`${id}-mode`}
                      value={mode}
                      checked={inputs.mode === mode}
                      onChange={() => change({ mode })}
                      className="size-4 accent-pine"
                    />
                    {mode === 'unlock' ? 'Unlock PDF' : 'Protect PDF'}
                  </label>
                ))}
              </div>
              <div>
                <label htmlFor={`${id}-current`} className="mb-1 block text-sm text-ink">
                  Current PDF password
                </label>
                <input
                  id={`${id}-current`}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={inputs.inputPassword}
                  onChange={(event) => change({ inputPassword: event.target.value })}
                  onPaste={checkPaste}
                  aria-describedby={`${id}-current-hint`}
                  className={inputClass}
                />
                <p id={`${id}-current-hint`} className="mt-1 text-xs text-muted">
                  Optional: use a known opening or owner password. Leave blank if none is needed to
                  open the PDF, including a PDF with only an owner password. No cracking or
                  guessing.
                </p>
              </div>
              {inputs.mode === 'protect' && (
                <>
                  <div>
                    <label htmlFor={`${id}-open`} className="mb-1 block text-sm text-ink">
                      Opening password
                    </label>
                    <input
                      id={`${id}-open`}
                      type="password"
                      autoComplete="new-password"
                      spellCheck={false}
                      required
                      value={inputs.userPassword}
                      onChange={(event) => change({ userPassword: event.target.value })}
                      onPaste={checkPaste}
                      aria-describedby={`${id}-open-hint`}
                      className={inputClass}
                    />
                    <p id={`${id}-open-hint`} className="mt-1 text-xs text-muted">
                      Required new password. Share with readers: it opens the protected PDF.
                    </p>
                  </div>
                  <div>
                    <label htmlFor={`${id}-owner`} className="mb-1 block text-sm text-ink">
                      Owner password
                    </label>
                    <input
                      id={`${id}-owner`}
                      type="password"
                      autoComplete="new-password"
                      spellCheck={false}
                      required
                      value={inputs.ownerPassword}
                      onChange={(event) => change({ ownerPassword: event.target.value })}
                      onPaste={checkPaste}
                      aria-describedby={`${id}-owner-hint`}
                      className={inputClass}
                    />
                    <p id={`${id}-owner-hint`} className="mt-1 text-xs text-muted">
                      Required new password. Keep private: it grants unrestricted access in
                      compliant readers and must differ from the opening password.
                    </p>
                  </div>
                  <p className="text-xs text-muted">
                    Each new password is limited to 127 UTF-8 bytes, not characters; nothing is
                    truncated. NUL characters are not allowed. These single-line fields cannot
                    accept line breaks.
                  </p>
                  <p className="text-xs text-muted">
                    ASCII passwords offer the widest reader compatibility. Some Unicode characters
                    are normalized differently by PDF viewers.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`${id}-print`} className="mb-1 block text-sm text-ink">
                        Printing
                      </label>
                      <select
                        id={`${id}-print`}
                        value={inputs.permissions.print}
                        onChange={(event) =>
                          change({
                            permissions: {
                              ...inputs.permissions,
                              print: event.target.value as PdfPermissions['print'],
                            },
                          })
                        }
                        className={inputClass}
                      >
                        <option value="full">Full resolution</option>
                        <option value="low">Low resolution only</option>
                        <option value="none">Not allowed</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`${id}-modify`} className="mb-1 block text-sm text-ink">
                        Changes
                      </label>
                      <select
                        id={`${id}-modify`}
                        value={inputs.permissions.modify}
                        onChange={(event) =>
                          change({
                            permissions: {
                              ...inputs.permissions,
                              modify: event.target.value as PdfPermissions['modify'],
                            },
                          })
                        }
                        className={inputClass}
                      >
                        <option value="all">All changes</option>
                        <option value="annotate">Annotations, forms and assembly</option>
                        <option value="form">Form filling and assembly</option>
                        <option value="assembly">Page assembly only</option>
                        <option value="none">No changes</option>
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={inputs.permissions.extract}
                      onChange={(event) =>
                        change({
                          permissions: { ...inputs.permissions, extract: event.target.checked },
                        })
                      }
                      className="size-4 accent-pine"
                    />
                    Allow copying text and images
                  </label>
                </>
              )}
            </fieldset>
            <Button type="submit" disabled={!file || busy} className="w-full sm:w-auto">
              <KeyRound className="size-4" />
              {inputs.mode === 'unlock' ? 'Unlock PDF' : 'Protect PDF'}
            </Button>
          </form>
          <section aria-label="Security information and result" className="min-w-0 space-y-3">
            <div className="space-y-2 rounded-lg border border-line bg-amber-soft p-3 text-xs text-amber-badge">
              <p>
                Rewriting a PDF may invalidate existing digital signatures. Keep the original if
                signature validity matters.
              </p>
              <p>
                Printing, editing and copying restrictions are advisory and reader-enforced, not
                cryptographic access controls. AES-256 protects opening the PDF, not what an
                authorized reader can do with its contents.
              </p>
              <p>
                Text, vector content, form fields and annotations are preserved rather than
                flattened. This tool does not redact content.
              </p>
            </div>
            {busy && (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-card p-3">
                <ProgressBar
                  className="min-w-0 flex-1"
                  label={
                    inputs.mode === 'unlock' ? 'Unlocking PDF locally…' : 'Protecting PDF locally…'
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    invalidate()
                    setNotice('Cancelled. Your original PDF is unchanged; you can try again.')
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-line bg-amber-soft p-3 text-sm break-words text-amber-badge"
              >
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-muted">
                {notice}
              </p>
            )}
            {result && (
              <div className="space-y-3 rounded-lg border border-line bg-card p-3 sm:p-4">
                <div role="status">
                  <h2 className="text-sm font-semibold text-ink">
                    {result.mode === 'unlock'
                      ? 'Unlocked PDF ready'
                      : 'AES-256 protected PDF ready'}
                  </h2>
                  <p className="mt-1 text-xs break-all text-muted">{result.filename}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatBytes(result.blob.size)} · New copy
                  </p>
                </div>
                {result.warnings.length > 0 && (
                  <ul className="list-disc space-y-1 pl-4 text-xs break-words text-amber-badge">
                    {result.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                )}
                <Button
                  onClick={() => downloadBlob(result.blob, result.filename)}
                  className="w-full sm:w-auto"
                >
                  <FileDown className="size-4" />
                  Download {result.mode === 'unlock' ? 'unlocked' : 'protected'} PDF
                </Button>
                <p className="text-xs text-muted">
                  Changing any password or setting clears this result. Downloaded copies are not
                  affected by later changes.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </ToolLayout>
  )
}
