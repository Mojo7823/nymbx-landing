import { useRef, useState } from 'react'
import { AlertTriangle, Download, FolderArchive, Trash2 } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { streamZip, type ZipInput } from '../../lib/zipStream'
import { convertDocx, toHtmlDocument, type DocxConversion, type ImageMode } from './convertDocx'
import '../markdown-renderer/preview.css'

interface LoadedDoc {
  name: string
  size: number
  buffer: ArrayBuffer
}

type View = 'preview' | 'html' | 'markdown'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export default function DocxToHtmlMarkdown() {
  const [doc, setDoc] = useState<LoadedDoc | null>(null)
  const [imageMode, setImageMode] = useState<ImageMode>('embed')
  const [result, setResult] = useState<DocxConversion | null>(null)
  const [converting, setConverting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('preview')

  // Bumped to invalidate in-flight conversions when the file or mode changes.
  const convertSeq = useRef(0)

  async function runConvert(loaded: LoadedDoc, mode: ImageMode) {
    const seq = ++convertSeq.current
    setConverting(true)
    setError(null)
    try {
      const res = await convertDocx(loaded.buffer, mode)
      if (seq === convertSeq.current) setResult(res)
    } catch {
      if (seq === convertSeq.current) {
        setResult(null)
        setError(
          'Could not convert this file. It may be corrupted, password-protected, or an old binary .doc — only .docx is supported.',
        )
      }
    } finally {
      if (seq === convertSeq.current) setConverting(false)
    }
  }

  async function loadFile(files: File[]) {
    const file = files[0]
    if (!file) return
    setError(null)
    setResult(null)
    const loaded = { name: file.name, size: file.size, buffer: await file.arrayBuffer() }
    setDoc(loaded)
    await runConvert(loaded, imageMode)
  }

  function changeImageMode(mode: ImageMode) {
    setImageMode(mode)
    if (doc) void runConvert(doc, mode)
  }

  function reset() {
    convertSeq.current++
    setDoc(null)
    setResult(null)
    setError(null)
    setConverting(false)
  }

  const base = doc ? doc.name.replace(/\.docx$/i, '') : 'document'
  const zipped = imageMode === 'separate' && (result?.images.length ?? 0) > 0

  async function download(kind: 'html' | 'md') {
    if (!result) return
    const content = kind === 'html' ? toHtmlDocument(result.html, base) : result.markdown
    const type = kind === 'html' ? 'text/html' : 'text/markdown'
    if (zipped) {
      const entries: ZipInput[] = [
        { name: `${base}.${kind}`, blob: new Blob([content], { type }) },
        ...result.images.map((img) => ({ name: img.name, blob: new Blob([img.data]) })),
      ]
      downloadBlob(await streamZip(entries), `${base}-${kind}.zip`)
    } else {
      downloadBlob(new Blob([content], { type }), `${base}.${kind}`)
    }
  }

  const copyText = result ? (view === 'markdown' ? result.markdown : result.html) : ''

  return (
    <ToolLayout
      title="DOCX → HTML / Markdown"
      description="Convert a Word document to clean HTML or GFM markdown with mammoth. Images can be embedded as base64 or exported as separate files in a zip. Everything stays in your browser."
      badge="client-side"
    >
      {!doc ? (
        <>
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <FileDropzone
            accept={`.docx,${DOCX_MIME}`}
            onFiles={(files) => void loadFile(files)}
            hint="One .docx file at a time"
          />
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{doc.name}</p>
              <p className="font-mono text-[11px] text-muted tabular-nums">
                {formatBytes(doc.size)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <Trash2 className="size-3.5" />
              Choose another
            </Button>
          </div>

          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-line bg-card p-4">
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <legend className="sr-only">Image handling</legend>
              <span className="text-xs font-medium text-muted">Images</span>
              {(
                [
                  ['embed', 'Embed as base64'],
                  ['separate', 'Separate files (zip)'],
                ] as const
              ).map(([m, label]) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink"
                >
                  <input
                    type="radio"
                    name="imageMode"
                    checked={imageMode === m}
                    onChange={() => changeImageMode(m)}
                    className="size-3.5 accent-(--color-pine)"
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <p className="text-xs text-muted">
              {imageMode === 'embed'
                ? 'Images are inlined into the document as data URIs — output files can get large.'
                : 'Downloads become a zip: the document plus an images/ folder it references.'}
            </p>
          </div>

          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {converting && <ProgressBar label="Converting" />}

          {result && !converting && (
            <>
              {result.warnings.length > 0 && (
                <details className="mb-4 rounded-lg border border-line bg-card p-3 text-sm text-amber-badge">
                  <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
                    <AlertTriangle className="size-4 shrink-0" />
                    {result.warnings.length} conversion{' '}
                    {result.warnings.length === 1 ? 'warning' : 'warnings'}
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-6 text-xs">
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <div role="tablist" aria-label="Output view" className="flex gap-1">
                  {(
                    [
                      ['preview', 'Preview'],
                      ['html', 'HTML'],
                      ['markdown', 'Markdown'],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={cx(
                        'h-8 cursor-pointer rounded-md border px-3 text-xs font-medium transition-colors',
                        view === v
                          ? 'border-pine bg-mint text-pine'
                          : 'border-line-strong bg-card text-muted hover:text-ink',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {view !== 'preview' && <CopyButton text={copyText} />}
                  <Button variant="secondary" size="sm" onClick={() => void download('html')}>
                    {zipped ? (
                      <FolderArchive className="size-3.5" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    Download .html{zipped ? ' (zip)' : ''}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void download('md')}>
                    {zipped ? (
                      <FolderArchive className="size-3.5" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    Download .md{zipped ? ' (zip)' : ''}
                  </Button>
                </div>
              </div>

              {imageMode === 'separate' && (
                <p className="mt-2 font-mono text-[11px] text-muted tabular-nums" role="status">
                  {result.images.length} {result.images.length === 1 ? 'image' : 'images'} extracted
                </p>
              )}

              <div className="mt-4">
                {result.html === '' ? (
                  <p className="rounded-lg border border-line bg-card p-4 text-sm text-muted">
                    This document has no convertible content.
                  </p>
                ) : view === 'preview' ? (
                  <div
                    className="md-preview max-h-[36rem] overflow-auto rounded-lg border border-line bg-card p-4"
                    // Sanitized by DOMPurify in convertDocx.
                    dangerouslySetInnerHTML={{ __html: result.html }}
                  />
                ) : (
                  <pre className="max-h-[36rem] overflow-auto rounded-lg border border-line bg-card p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink">
                    {view === 'html' ? result.html : result.markdown}
                  </pre>
                )}
              </div>
            </>
          )}
        </>
      )}
    </ToolLayout>
  )
}
