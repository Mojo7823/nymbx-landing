import { useEffect, useState } from 'react'
import { Download, FileWarning, FolderArchive, Images, ScanText, Trash2 } from 'lucide-react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { streamZip, type ZipInput } from '../../lib/zipStream'
import { pagesToMarkdown, type MdTextItem } from './textToMarkdown'

interface LoadedPdf {
  name: string
  size: number
  doc: PDFDocumentProxy
  /** Kept so the pdf.js document (and its worker memory) can be released. */
  task: PDFDocumentLoadingTask
  pageCount: number
}

type Mode = 'images' | 'markdown'
type ImageFormat = 'png' | 'jpeg'
type Scope = 'all' | 'single'

const DPI_CHOICES = [72, 96, 150, 300]

async function openPdf(file: File): Promise<LoadedPdf> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  return { name: file.name, size: file.size, doc, task, pageCount: doc.numPages }
}

/** Render one page to an image blob at the given DPI. */
async function renderPageToImage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  dpi: number,
  format: ImageFormat,
  quality: number,
): Promise<Blob> {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: dpi / 72 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvas, viewport }).promise
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      format === 'png' ? 'image/png' : 'image/jpeg',
      quality,
    ),
  )
  canvas.width = 0 // release backing store promptly
  return blob
}

function isTextItem(item: unknown): item is TextItem {
  return typeof (item as { str?: unknown }).str === 'string'
}

/** Extract every page's text items in the reduced shape the heuristics use. */
async function extractTextItems(
  doc: PDFDocumentProxy,
  onProgress: (done: number, total: number) => void,
): Promise<MdTextItem[][]> {
  const pages: MdTextItem[][] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(
      content.items.filter(isTextItem).map((item) => {
        const t = item.transform as number[]
        return {
          str: item.str,
          fontSize: Math.hypot(t[2], t[3]),
          x: t[4],
          y: t[5],
          width: item.width,
          hasEOL: item.hasEOL,
        }
      }),
    )
    onProgress(i, doc.numPages)
  }
  return pages
}

export default function PdfToImageMarkdown() {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('images')
  const [format, setFormat] = useState<ImageFormat>('png')
  const [quality, setQuality] = useState(0.9)
  const [dpi, setDpi] = useState(150)
  const [scope, setScope] = useState<Scope>('all')
  const [pageNum, setPageNum] = useState(1)
  const [busy, setBusy] = useState<null | { label: string; done: number; total: number }>(null)
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [scanned, setScanned] = useState(false)

  useEffect(
    () => () => void pdf?.task.destroy(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  async function loadFile(files: File[]) {
    const file = files[0]
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      const next = await openPdf(file)
      void pdf?.task.destroy()
      setPdf(next)
      setPageNum(1)
      setMarkdown(null)
      setScanned(false)
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      setError(
        name === 'PasswordException'
          ? 'This PDF is password-protected. Remove the password first; encrypted files are not supported.'
          : 'Could not read this file as a PDF. It may be corrupted or not a PDF at all.',
      )
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    void pdf?.task.destroy()
    setPdf(null)
    setError(null)
    setMarkdown(null)
    setScanned(false)
  }

  const baseName = pdf ? pdf.name.replace(/\.pdf$/i, '') : ''
  const ext = format === 'png' ? 'png' : 'jpg'

  async function exportImages() {
    if (!pdf) return
    setError(null)
    const pages =
      scope === 'single'
        ? [Math.min(Math.max(1, pageNum), pdf.pageCount)]
        : Array.from({ length: pdf.pageCount }, (_, i) => i + 1)
    setBusy({ label: 'Rendering', done: 0, total: pages.length })
    try {
      const pad = String(pdf.pageCount).length
      const entries: ZipInput[] = []
      for (const [i, n] of pages.entries()) {
        const blob = await renderPageToImage(pdf.doc, n, dpi, format, quality)
        entries.push({ name: `${baseName}-page-${String(n).padStart(pad, '0')}.${ext}`, blob })
        setBusy({ label: 'Rendering', done: i + 1, total: pages.length })
      }
      if (entries.length === 1) {
        downloadBlob(entries[0].blob, entries[0].name)
      } else {
        downloadBlob(await streamZip(entries), `${baseName}-images.zip`)
      }
    } catch {
      setError('Rendering failed. This PDF may use features pdf.js cannot draw.')
    } finally {
      setBusy(null)
    }
  }

  async function extractMarkdown() {
    if (!pdf) return
    setError(null)
    setScanned(false)
    setBusy({ label: 'Extracting', done: 0, total: pdf.pageCount })
    try {
      const pages = await extractTextItems(pdf.doc, (done, total) =>
        setBusy({ label: 'Extracting', done, total }),
      )
      const hasText = pages.some((p) => p.some((item) => item.str.trim().length > 0))
      if (!hasText) {
        setMarkdown(null)
        setScanned(true)
      } else {
        setMarkdown(pagesToMarkdown(pages))
      }
    } catch {
      setError('Text extraction failed. This PDF may be corrupted.')
    } finally {
      setBusy(null)
    }
  }

  const selectClass =
    'h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none'

  return (
    <ToolLayout
      title="PDF → image / markdown"
      description="Render PDF pages as PNG or JPEG images at a chosen DPI, or extract the text layer as markdown with headings inferred from font sizes. Everything stays in your browser."
      badge="client-side"
    >
      {!pdf ? (
        <>
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {loading ? (
            <ProgressBar label="Reading PDF" />
          ) : (
            <FileDropzone
              accept="application/pdf,.pdf"
              onFiles={(files) => void loadFile(files)}
              hint="One PDF at a time"
            />
          )}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{pdf.name}</p>
              <p className="font-mono text-[11px] text-muted tabular-nums">
                {pdf.pageCount} {pdf.pageCount === 1 ? 'page' : 'pages'} · {formatBytes(pdf.size)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <Trash2 className="size-3.5" />
              Choose another
            </Button>
          </div>

          <div className="mb-4 flex flex-col gap-4 rounded-lg border border-line bg-card p-4">
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <legend className="sr-only">Output</legend>
              {(
                [
                  ['images', 'Pages → images'],
                  ['markdown', 'Text → markdown'],
                ] as const
              ).map(([m, label]) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink"
                >
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    className="size-3.5 accent-(--color-pine)"
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            {mode === 'images' ? (
              <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted">Pages</span>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as Scope)}
                    className={selectClass}
                  >
                    <option value="all">All pages{pdf.pageCount > 1 ? ' (zip)' : ''}</option>
                    <option value="single">Single page</option>
                  </select>
                </label>
                {scope === 'single' && (
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted">Page (1–{pdf.pageCount})</span>
                    <input
                      type="number"
                      min={1}
                      max={pdf.pageCount}
                      value={pageNum}
                      onChange={(e) => setPageNum(Number(e.target.value) || 1)}
                      className="h-8 w-24 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
                    />
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted">Format</span>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as ImageFormat)}
                    className={selectClass}
                  >
                    <option value="png">PNG</option>
                    <option value="jpeg">JPEG</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted">Resolution</span>
                  <select
                    value={dpi}
                    onChange={(e) => setDpi(Number(e.target.value))}
                    className={selectClass}
                  >
                    {DPI_CHOICES.map((d) => (
                      <option key={d} value={d}>
                        {d} DPI
                      </option>
                    ))}
                  </select>
                </label>
                {format === 'jpeg' && (
                  <label className="flex min-w-40 flex-col gap-1">
                    <span className="text-xs font-medium text-muted">
                      JPEG quality · {Math.round(quality * 100)}%
                    </span>
                    <input
                      type="range"
                      min={30}
                      max={95}
                      value={Math.round(quality * 100)}
                      onChange={(e) => setQuality(Number(e.target.value) / 100)}
                      className="accent-(--color-pine)"
                    />
                  </label>
                )}
              </div>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-muted">
                <FileWarning className="mt-0.5 size-3.5 shrink-0" />
                Headings are inferred from font sizes, so review the result. Scanned PDFs (images of
                text) have no text layer and need OCR, which is planned as a separate tool.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            {mode === 'images' ? (
              <Button onClick={() => void exportImages()} disabled={!!busy}>
                {scope === 'all' && pdf.pageCount > 1 ? (
                  <FolderArchive className="size-4" />
                ) : (
                  <Images className="size-4" />
                )}
                {scope === 'all' && pdf.pageCount > 1
                  ? `Export ${pdf.pageCount} pages as zip`
                  : 'Export page as image'}
              </Button>
            ) : (
              <Button onClick={() => void extractMarkdown()} disabled={!!busy}>
                <ScanText className="size-4" />
                Extract markdown
              </Button>
            )}
            {busy && (
              <ProgressBar
                className="min-w-40 flex-1"
                value={busy.total === 0 ? 100 : (busy.done / busy.total) * 100}
                label={`${busy.label} page ${busy.done}/${busy.total}`}
              />
            )}
          </div>

          {mode === 'markdown' && scanned && !busy && (
            <p
              role="status"
              className="mt-4 flex items-start gap-1.5 rounded-lg border border-line bg-card p-4 text-sm text-amber-badge"
            >
              <FileWarning className="mt-0.5 size-4 shrink-0" />
              No text layer found. This looks like a scanned PDF. Extracting its text needs OCR,
              which this tool does not do yet; a dedicated OCR tool is planned.
            </p>
          )}

          {mode === 'markdown' && markdown !== null && !busy && (
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted tabular-nums" role="status">
                  {markdown.length.toLocaleString()} characters
                </span>
                <CopyButton text={markdown} />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadBlob(new Blob([markdown], { type: 'text/markdown' }), `${baseName}.md`)
                  }
                >
                  <Download className="size-3.5" />
                  Download .md
                </Button>
              </div>
              <pre className="max-h-96 overflow-auto rounded-lg border border-line bg-card p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink">
                {markdown}
              </pre>
            </div>
          )}
        </>
      )}
    </ToolLayout>
  )
}
