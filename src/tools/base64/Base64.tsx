import { useEffect, useRef, useState } from 'react'
import { proxy } from 'comlink'
import { ArrowLeftRight, Download, Sparkles } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { FileDropzone } from '../../components/FileDropzone'
import { ProgressBar } from '../../components/ProgressBar'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import type { Base64WorkerApi } from './base64.worker'
import { decodeBase64, encodeText, parseBase64Input, toDataUri } from './codec'

type Direction = 'encode' | 'decode'

type Output =
  | { kind: 'encoded'; value: string; inputBytes: number }
  | { kind: 'decoded-text'; value: string; bytes: Uint8Array; mime?: string }
  | { kind: 'decoded-binary'; bytes: Uint8Array; mime?: string }

const SAMPLES: Record<Direction, string> = {
  encode: 'Hello 世界 🌏 — base64 keeps every byte intact.',
  decode: encodeText('Hello 世界 🌏 — base64 keeps every byte intact.', false),
}

/** Above this many characters, decode work moves off the main thread. */
const WORKER_THRESHOLD = 2 * 1024 * 1024
/** Cap what the output textarea renders; copy and download always use the full value. */
const DISPLAY_LIMIT = 1024 * 1024
/** Beyond this, hide the copy button and offer download only. */
const COPY_LIMIT = 8 * 1024 * 1024

function binaryBlob(output: Extract<Output, { kind: 'decoded-binary' | 'decoded-text' }>) {
  return new Blob([output.bytes.slice().buffer], {
    type: output.mime ?? 'application/octet-stream',
  })
}

export default function Base64() {
  const [direction, setDirection] = useState<Direction>('encode')
  const [text, setText] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [urlSafe, setUrlSafe] = useState(false)
  const [dataUri, setDataUri] = useState(false)
  const [output, setOutput] = useState<Output | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const workerRef = useRef<WorkerHandle<Base64WorkerApi> | null>(null)
  useEffect(() => () => workerRef.current?.terminate(), [])

  function worker() {
    workerRef.current ??= wrapWorker<Base64WorkerApi>(
      new Worker(new URL('./base64.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current.api
  }

  function reset(nextDirection = direction) {
    setDirection(nextDirection)
    setText('')
    setSourceName('')
    setOutput(null)
    setError(null)
    setProgress(0)
  }

  function decodedOutput(input: string, decoded: { bytes: Uint8Array; text?: string }): Output {
    const { mime } = parseBase64Input(input)
    return decoded.text !== undefined
      ? { kind: 'decoded-text', value: decoded.text, bytes: decoded.bytes, mime }
      : { kind: 'decoded-binary', bytes: decoded.bytes, mime }
  }

  async function openFile(file: File | undefined) {
    if (!file) return
    setSourceName(file.name)
    setText('')
    setOutput(null)
    setError(null)
    setBusy(true)
    setProgress(0)
    try {
      if (direction === 'encode') {
        const useUrlSafe = urlSafe && !dataUri
        const encoded = await worker().encodeFile(file, useUrlSafe, proxy(setProgress))
        setOutput({
          kind: 'encoded',
          value: dataUri ? toDataUri(encoded, file.type || 'application/octet-stream') : encoded,
          inputBytes: file.size,
        })
      } else {
        const raw = await file.text()
        const { base64 } = parseBase64Input(raw)
        const decoded =
          base64.length > WORKER_THRESHOLD ? await worker().decode(base64) : decodeBase64(base64)
        setOutput(decodedOutput(raw, decoded))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Conversion failed.')
    } finally {
      setBusy(false)
    }
  }

  function convert() {
    setError(null)
    try {
      if (direction === 'encode') {
        const encoded = encodeText(text, urlSafe && !dataUri)
        setOutput({
          kind: 'encoded',
          value: dataUri ? toDataUri(encoded, 'text/plain;charset=utf-8') : encoded,
          inputBytes: new TextEncoder().encode(text).length,
        })
      } else {
        setOutput(decodedOutput(text, decodeBase64(parseBase64Input(text).base64)))
      }
    } catch (cause) {
      setOutput(null)
      setError(cause instanceof Error ? cause.message : 'Conversion failed.')
    }
  }

  const textValue = output && output.kind !== 'decoded-binary' ? output.value : undefined
  const stats =
    output?.kind === 'encoded'
      ? `${formatBytes(output.inputBytes)} → ${formatBytes(output.value.length)} of base64`
      : output
        ? `${formatBytes(output.bytes.length)} decoded${output.mime ? ` · ${output.mime}` : ''}`
        : ''

  return (
    <ToolLayout
      title="Base64 encode / decode"
      description="Encode text or any file to base64 — standard or URL-safe, optionally as a data URI — and decode base64 back to text or a binary download. Everything runs in your browser."
      badge="client-side"
    >
      <div role="tablist" aria-label="Direction" className="mb-4 flex gap-1">
        {(
          [
            ['encode', 'Encode'],
            ['decode', 'Decode'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={direction === value}
            onClick={() => reset(value)}
            className={cx(
              'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              direction === value ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {direction === 'encode' ? (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-soft p-3">
          <label
            className={cx(
              'flex items-center gap-2 text-xs font-medium text-muted',
              dataUri ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            )}
          >
            <input
              name="url-safe"
              type="checkbox"
              checked={urlSafe && !dataUri}
              disabled={dataUri}
              onChange={(event) => setUrlSafe(event.target.checked)}
              className="accent-pine"
            />
            URL-safe alphabet (<span className="font-mono">-_</span>, no padding)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted">
            <input
              name="data-uri"
              type="checkbox"
              checked={dataUri}
              onChange={(event) => setDataUri(event.target.checked)}
              className="accent-pine"
            />
            Output a data URI
          </label>
        </div>
      ) : (
        <p className="mb-4 rounded-lg border border-line bg-soft p-3 text-xs text-muted">
          Standard and URL-safe alphabets, wrapped lines, and full data URIs are all detected
          automatically.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <textarea
            name="input"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setSourceName('')
              setOutput(null)
            }}
            placeholder={
              direction === 'encode' ? 'Paste text to encode…' : 'Paste base64 or a data URI…'
            }
            aria-label={direction === 'encode' ? 'Text input' : 'Base64 input'}
            spellCheck={false}
            className="h-56 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={convert} disabled={!text.trim() || busy}>
              <ArrowLeftRight className="size-4" />
              {direction === 'encode' ? 'Encode' : 'Decode'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setText(SAMPLES[direction])
                setSourceName('')
                setOutput(null)
              }}
            >
              <Sparkles className="size-3.5" />
              Load sample
            </Button>
          </div>
        </div>

        <div className="min-w-0">
          {busy ? (
            <ProgressBar label="Encoding file" value={progress * 100} />
          ) : sourceName ? (
            <div className="rounded-lg border border-line bg-card p-4">
              <p className="truncate text-sm font-medium text-ink">{sourceName}</p>
              <p className="mt-1 text-xs text-muted">File processed locally.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => reset()}>
                Choose another
              </Button>
            </div>
          ) : (
            <FileDropzone
              accept={direction === 'decode' ? '.txt,.b64,text/plain' : undefined}
              onFiles={(files) => void openFile(files[0])}
              hint={
                direction === 'encode'
                  ? 'Any file — large files encode in a background worker'
                  : 'A text file containing base64 or a data URI'
              }
            />
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-line bg-rose-soft p-3 text-sm text-rose"
        >
          {error}
        </p>
      )}

      {output && (
        <section className="mt-6 border-t border-line pt-5" aria-labelledby="output-heading">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 id="output-heading" className="mr-auto text-sm font-semibold text-ink">
              {output.kind === 'encoded'
                ? 'Encoded output'
                : output.kind === 'decoded-text'
                  ? 'Decoded text'
                  : 'Decoded binary'}
            </h2>
            <span className="font-mono text-[11px] text-muted tabular-nums">{stats}</span>
            {textValue !== undefined && textValue.length <= COPY_LIMIT && (
              <CopyButton text={textValue} />
            )}
            {output.kind === 'encoded' ? (
              <Button
                size="sm"
                onClick={() =>
                  downloadBlob(
                    new Blob([output.value], { type: 'text/plain;charset=utf-8' }),
                    dataUri ? 'data-uri.txt' : 'encoded.txt',
                  )
                }
              >
                <Download className="size-3.5" />
                Download .txt
              </Button>
            ) : (
              <>
                {output.kind === 'decoded-text' && (
                  <Button
                    size="sm"
                    onClick={() =>
                      downloadBlob(
                        new Blob([output.value], { type: 'text/plain;charset=utf-8' }),
                        'decoded.txt',
                      )
                    }
                  >
                    <Download className="size-3.5" />
                    Download text
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={output.kind === 'decoded-text' ? 'ghost' : 'primary'}
                  onClick={() => downloadBlob(binaryBlob(output), 'decoded.bin')}
                >
                  <Download className="size-3.5" />
                  Download binary
                </Button>
              </>
            )}
          </div>

          {output.kind === 'decoded-binary' ? (
            <p className="rounded-lg border border-line bg-card p-4 text-sm text-muted">
              The decoded bytes are not valid UTF-8 text, so there is nothing to preview — use the
              binary download above.
            </p>
          ) : (
            <>
              <textarea
                name="output"
                readOnly
                value={
                  textValue !== undefined && textValue.length > DISPLAY_LIMIT
                    ? textValue.slice(0, DISPLAY_LIMIT)
                    : (textValue ?? '')
                }
                aria-label="Output"
                spellCheck={false}
                className="h-56 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed break-all text-ink focus:border-pine focus:outline-none"
              />
              {textValue !== undefined && textValue.length > DISPLAY_LIMIT && (
                <p className="mt-2 text-xs text-muted">
                  Showing the first {formatBytes(DISPLAY_LIMIT)} of {formatBytes(textValue.length)};
                  copy and download include everything.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </ToolLayout>
  )
}
