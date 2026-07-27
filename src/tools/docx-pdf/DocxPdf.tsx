import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, CloudUpload, Download, Info, Trash2, X } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { convertToPdf, pdfName, ConvertError, MAX_FILE_BYTES, type ConvertHandle } from './convert'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type Stage =
  | { kind: 'idle' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'converting' }
  | { kind: 'done'; pdf: Blob }

export default function DocxPdf() {
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const handleRef = useRef<ConvertHandle | null>(null)

  // Abort any in-flight upload when leaving the page.
  useEffect(() => () => handleRef.current?.cancel(), [])

  const busy = stage.kind === 'uploading' || stage.kind === 'converting'

  async function convert() {
    if (!file || busy) return
    setError(null)
    setStage({ kind: 'uploading', percent: 0 })
    const handle = convertToPdf(file, (percent) => {
      setStage(percent >= 100 ? { kind: 'converting' } : { kind: 'uploading', percent })
    })
    handleRef.current = handle
    try {
      const pdf = await handle.result
      setStage({ kind: 'done', pdf })
      downloadBlob(pdf, pdfName(file.name))
    } catch (e) {
      setStage({ kind: 'idle' })
      if (e instanceof ConvertError && e.message !== 'cancelled') setError(e.message)
    } finally {
      handleRef.current = null
    }
  }

  function cancel() {
    handleRef.current?.cancel()
  }

  function reset() {
    handleRef.current?.cancel()
    setFile(null)
    setStage({ kind: 'idle' })
    setError(null)
  }

  return (
    <ToolLayout
      title="DOCX → PDF"
      description="High-fidelity Word-to-PDF conversion using LibreOffice on our server. This is the one tool here that can't run in your browser."
      badge="server-assisted"
    >
      <div
        className="mb-6 flex items-start gap-2.5 rounded-lg border border-amber-badge/30 bg-amber-soft p-4 text-sm text-amber-badge"
        role="note"
      >
        <CloudUpload className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">This tool uploads your file to our server</strong> for
          conversion. It is processed in memory and deleted immediately after, so nothing is stored.
          Every other tool in this toolbox runs entirely on your device.
        </p>
      </div>

      {!file ? (
        <FileDropzone
          accept={`.docx,.doc,${DOCX_MIME},application/msword`}
          maxSize={MAX_FILE_BYTES}
          onFiles={(files) => {
            setError(null)
            setStage({ kind: 'idle' })
            setFile(files[0] ?? null)
          }}
          hint={`One .docx or .doc file, up to ${formatBytes(MAX_FILE_BYTES)}`}
          privacyNote="Uploaded to our server only when you convert"
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{file.name}</p>
              <p className="font-mono text-[11px] text-muted tabular-nums">
                {formatBytes(file.size)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>
              <Trash2 className="size-3.5" />
              Choose another
            </Button>
          </div>

          {stage.kind === 'uploading' && (
            <div className="mb-4 flex items-center gap-3">
              <ProgressBar value={stage.percent} label="Uploading" className="flex-1" />
              <Button variant="ghost" size="sm" onClick={cancel}>
                <X className="size-3.5" />
                Cancel
              </Button>
            </div>
          )}
          {stage.kind === 'converting' && (
            <div className="mb-4 flex items-center gap-3">
              <ProgressBar label="Converting on server" className="flex-1" />
              <Button variant="ghost" size="sm" onClick={cancel}>
                <X className="size-3.5" />
                Cancel
              </Button>
            </div>
          )}

          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {stage.kind === 'done' ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card p-4">
              <CheckCircle2 className="size-5 shrink-0 text-pine" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">Converted to {pdfName(file.name)}</p>
                <p className="font-mono text-[11px] text-muted tabular-nums">
                  {formatBytes(stage.pdf.size)} · download started automatically
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => downloadBlob(stage.pdf, pdfName(file.name))}
              >
                <Download className="size-3.5" />
                Download again
              </Button>
            </div>
          ) : (
            <Button onClick={() => void convert()} disabled={busy}>
              <CloudUpload className="size-4" />
              {busy ? 'Converting…' : 'Upload & convert to PDF'}
            </Button>
          )}
        </>
      )}

      <p className="mt-6 flex items-start gap-1.5 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          PDF → DOCX is not offered: the conversion engine can't turn a PDF back into a
          well-structured Word document at acceptable quality. For getting text out of a PDF, use
          the client-side PDF → image / markdown tool instead.
        </span>
      </p>
    </ToolLayout>
  )
}
