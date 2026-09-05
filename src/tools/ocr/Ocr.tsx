import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileWarning, RotateCcw, ScanText, X } from 'lucide-react'
import type { Worker as TesseractWorker } from 'tesseract.js'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes, transferLabel } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { toast } from '../../lib/toast'
import { getSetting, setSetting } from '../../lib/settings'
import { createProgressGuard } from '../../lib/worker'
import { prefetchUrls, PrefetchCancelled, PrefetchError } from '../../lib/prefetch'
import {
  createOcrWorker,
  DEFAULT_LANGS,
  enginePrefetchItems,
  LANGUAGES,
  langPrefetchItems,
  loadEngineManifest,
  normalizeLangs,
  recognizePage,
  reinitOcrWorker,
  type OcrLangId,
  type OcrLayout,
} from './ocrEngine'
import { PdfPasswordError, PdfReadError, renderPdfPages } from './pdfPages'
import {
  assembleMd,
  assembleTxt,
  LOW_CONFIDENCE,
  outputFileName,
  pageQuality,
  pageTitle,
  type OcrPage,
} from './ocrText'

type Phase = 'idle' | 'preparing' | 'processing' | 'done' | 'error'

interface ResultPage extends OcrPage {
  id: string
  /** Set when this page failed; `text` is then empty. */
  failure?: string
}

interface PrepareState {
  loaded: number
  total: number
  speed?: number
  /** Set once the bytes are in and tesseract.js is booting (no byte counts). */
  status?: string
}

interface JobState {
  fileIndex: number
  fileCount: number
  fileName: string
  pageNumber: number
  pageCount: number | null
  /** 0–1 within the current page. */
  progress: number
}

const ACCEPT = 'image/png,image/jpeg,image/webp,application/pdf'
const SUPPORTED = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
/** Scanned pages need ~300 DPI; below that accuracy drops off a cliff. */
const PDF_DPI = 300

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function isSupported(file: File): boolean {
  return SUPPORTED.includes(file.type) || isPdf(file)
}

/** Friendly text for the engine's own boot statuses. */
function statusLabel(status: string): string {
  switch (status) {
    case 'loading tesseract core':
      return 'Starting the OCR engine…'
    case 'initializing tesseract':
    case 'initializing api':
      return 'Initializing…'
    case 'loading language traineddata':
      return 'Loading language data…'
    default:
      return 'Preparing…'
  }
}

let nextRun = 1

export default function Ocr() {
  const [langs, setLangs] = useState<OcrLangId[]>(DEFAULT_LANGS)
  const [layout, setLayout] = useState<OcrLayout>('auto')
  const [phase, setPhase] = useState<Phase>('idle')
  const [pages, setPages] = useState<ResultPage[]>([])
  const [prepare, setPrepare] = useState<PrepareState | null>(null)
  const [job, setJob] = useState<JobState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const workerRef = useRef<TesseractWorker | null>(null)
  /** Language/layout the live worker was last initialized with. */
  const workerStateRef = useRef<{ langs: string; layout: OcrLayout } | null>(null)
  /** Where tesseract.js's logger messages currently go. */
  const sinkRef = useRef<(p: { status: string; progress: number }) => void>(() => undefined)
  /** Kept so Retry can re-run the same drop without asking for the files again. */
  const filesRef = useRef<File[]>([])

  // Persisted language selection (settings, not user files — allowed in IndexedDB).
  useEffect(() => {
    let live = true
    void getSetting('ocrLanguages').then((stored) => {
      if (live && stored !== undefined) setLangs(normalizeLangs(stored))
    })
    return () => {
      live = false
    }
  }, [])

  const disposeWorker = useCallback(() => {
    const worker = workerRef.current
    workerRef.current = null
    workerStateRef.current = null
    if (worker) void worker.terminate()
  }, [])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      disposeWorker()
    },
    [disposeWorker],
  )

  function toggleLang(id: OcrLangId) {
    setLangs((prev) => {
      const next = prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
      // At least one language must stay selected, or there is nothing to read.
      if (next.length === 0) return prev
      const ordered = LANGUAGES.filter((l) => next.includes(l.id)).map((l) => l.id)
      void setSetting('ocrLanguages', ordered)
      return ordered
    })
  }

  async function ensureWorker(engineVersion: string, run: number): Promise<TesseractWorker> {
    const wanted = { langs: langs.join('+'), layout }
    const current = workerRef.current
    if (current && workerStateRef.current) {
      if (
        workerStateRef.current.langs !== wanted.langs ||
        workerStateRef.current.layout !== wanted.layout
      ) {
        await reinitOcrWorker(current, langs, layout)
        workerStateRef.current = wanted
      }
      return current
    }
    const worker = await createOcrWorker({
      langs,
      layout,
      engineVersion,
      onProgress: (p) => sinkRef.current(p),
    })
    if (runRef.current !== run) {
      void worker.terminate()
      throw new PrefetchCancelled('cancelled')
    }
    workerRef.current = worker
    workerStateRef.current = wanted
    return worker
  }

  /** Recognize one page, mirroring the engine's progress into the page bar. */
  async function recognizeGuarded(
    worker: TesseractWorker,
    image: File | HTMLCanvasElement,
    run: number,
  ) {
    const guard = createProgressGuard((p: { status: string; progress: number }) => {
      if (runRef.current !== run) return
      if (p.status === 'recognizing text') {
        setJob((prev) => (prev ? { ...prev, progress: p.progress } : prev))
      }
    })
    sinkRef.current = guard.onProgress
    try {
      return await recognizePage(worker, image)
    } finally {
      // Comlink-style late ticks apply here too: the logger posts on its own
      // channel, so a tick can land after `recognize` already resolved.
      guard.settle()
      sinkRef.current = () => undefined
    }
  }

  function appendPage(page: ResultPage) {
    setPages((prev) => [...prev, page])
  }

  async function processFile(
    worker: TesseractWorker,
    file: File,
    fileIndex: number,
    fileCount: number,
    run: number,
  ) {
    const base = { fileIndex, fileCount, fileName: file.name }
    if (!isPdf(file)) {
      setJob({ ...base, pageNumber: 1, pageCount: 1, progress: 0 })
      const { text, confidence } = await recognizeGuarded(worker, file, run)
      appendPage({
        id: `${file.name}-${fileIndex}`,
        sourceName: file.name,
        pageNumber: null,
        text,
        confidence,
      })
      return
    }

    for await (const rendered of renderPdfPages(file, PDF_DPI)) {
      if (runRef.current !== run) return
      setJob({
        ...base,
        pageNumber: rendered.pageNumber,
        pageCount: rendered.pageCount,
        progress: 0,
      })
      try {
        const { text, confidence } = await recognizeGuarded(worker, rendered.canvas, run)
        if (runRef.current !== run) return
        appendPage({
          id: `${file.name}-${fileIndex}-${rendered.pageNumber}`,
          sourceName: file.name,
          pageNumber: rendered.pageNumber,
          text,
          confidence,
        })
      } catch (cause) {
        if (runRef.current !== run) return
        console.error(cause)
        // A crash on one page must not lose the pages already recognized.
        appendPage({
          id: `${file.name}-${fileIndex}-${rendered.pageNumber}`,
          sourceName: file.name,
          pageNumber: rendered.pageNumber,
          text: '',
          confidence: 0,
          failure: 'This page could not be recognized. The rest of the file continued.',
        })
      }
    }
  }

  async function run(files: File[]) {
    const accepted = files.filter(isSupported)
    for (const rejected of files.filter((f) => !isSupported(f))) {
      toast(`${rejected.name} is not a PNG, JPEG, WebP or PDF.`, { variant: 'error' })
    }
    if (accepted.length === 0) return

    filesRef.current = accepted
    const runId = (runRef.current = nextRun++)
    abortRef.current?.abort()
    const aborter = new AbortController()
    abortRef.current = aborter

    setPhase('preparing')
    setError(null)
    setPages([])
    setJob(null)
    setPrepare({ loaded: 0, total: 0 })

    try {
      const manifest = await loadEngineManifest(aborter.signal)
      if (runRef.current !== runId) return
      const items = [...(await enginePrefetchItems(manifest)), ...langPrefetchItems(langs)]

      // Warm the HTTP cache with byte-level progress before tesseract.js does
      // its own (progress-free, timeout-free) fetches of the same URLs.
      let lastTick = performance.now()
      let lastLoaded = 0
      let speed: number | undefined
      await prefetchUrls(
        items,
        ({ loaded, total }) => {
          if (runRef.current !== runId) return
          const now = performance.now()
          const dt = (now - lastTick) / 1000
          if (dt > 0.5) {
            speed = Math.max(0, (loaded - lastLoaded) / dt)
            lastTick = now
            lastLoaded = loaded
          }
          setPrepare({ loaded, total, speed })
        },
        aborter.signal,
      )
      if (runRef.current !== runId) return

      sinkRef.current = (p) => {
        if (runRef.current !== runId) return
        setPrepare((prev) => (prev ? { ...prev, status: statusLabel(p.status) } : prev))
      }
      setPrepare((prev) => (prev ? { ...prev, status: 'Starting the OCR engine…' } : prev))
      const worker = await ensureWorker(manifest.version, runId)
      sinkRef.current = () => undefined
      if (runRef.current !== runId) return

      setPrepare(null)
      setPhase('processing')
      for (const [index, file] of accepted.entries()) {
        if (runRef.current !== runId) return
        try {
          await processFile(worker, file, index, accepted.length, runId)
        } catch (cause) {
          if (runRef.current !== runId) return
          if (cause instanceof PdfPasswordError || cause instanceof PdfReadError) {
            appendPage({
              id: `${file.name}-${index}-error`,
              sourceName: file.name,
              pageNumber: null,
              text: '',
              confidence: 0,
              failure: cause.message,
            })
            continue
          }
          throw cause
        }
      }
      if (runRef.current !== runId) return
      setJob(null)
      setPhase('done')
    } catch (cause) {
      if (runRef.current !== runId) return
      if (
        cause instanceof PrefetchCancelled ||
        (cause instanceof DOMException && cause.name === 'AbortError')
      ) {
        return
      }
      console.error(cause)
      setJob(null)
      setPrepare(null)
      setPhase('error')
      setError(
        cause instanceof PrefetchError
          ? cause.message
          : 'The OCR engine could not be loaded. Check your connection and try again.',
      )
    } finally {
      if (runRef.current === runId && abortRef.current === aborter) abortRef.current = null
    }
  }

  function cancel() {
    // Stop accepting results from the in-flight run, then tear the engine down.
    runRef.current = 0
    abortRef.current?.abort()
    abortRef.current = null
    sinkRef.current = () => undefined
    disposeWorker()
    setPrepare(null)
    setJob(null)
    // Pages already recognized stay on screen; that work is not thrown away.
    setPhase(pages.length === 0 ? 'idle' : 'done')
  }

  function reset() {
    runRef.current = 0
    abortRef.current?.abort()
    abortRef.current = null
    filesRef.current = []
    setPhase('idle')
    setPages([])
    setPrepare(null)
    setJob(null)
    setError(null)
  }

  const busy = phase === 'preparing' || phase === 'processing'
  const textPages = pages.filter((p) => !p.failure)
  const failedPages = pages.length - textPages.length
  const allText = textPages.length > 0 ? assembleTxt(textPages) : ''
  const baseName = pages[0]?.sourceName ?? 'ocr'

  const selectClass =
    'h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none'

  return (
    <ToolLayout
      title="OCR"
      description="Extract text from images and scanned PDFs, in your browser"
      badge="client-side"
    >
      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-line bg-card p-4">
        <fieldset className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <legend className="sr-only">Languages</legend>
          <span className="text-xs font-medium text-muted">Languages</span>
          {LANGUAGES.map((lang) => {
            const on = langs.includes(lang.id)
            const only = on && langs.length === 1
            return (
              <label
                key={lang.id}
                title={
                  only
                    ? 'At least one language must stay selected'
                    : `${lang.label} · ${formatBytes(lang.bytes)} download on first use`
                }
                className={cx(
                  'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  on ? 'border-pine bg-mint text-ink' : 'border-line-strong bg-card text-muted',
                  busy
                    ? 'cursor-not-allowed opacity-60'
                    : only
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer hover:bg-mint',
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={busy || only}
                  onChange={() => toggleLang(lang.id)}
                  className="size-3.5 accent-(--color-pine)"
                />
                <span>{lang.nativeLabel}</span>
                <span className="font-mono text-[10px] text-faint">
                  {lang.id} · {formatBytes(lang.bytes)}
                </span>
              </label>
            )
          })}
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Layout</span>
          <select
            value={layout}
            disabled={busy}
            onChange={(e) => setLayout(e.target.value as OcrLayout)}
            className={cx(selectClass, 'w-48')}
          >
            <option value="auto">Auto (default)</option>
            <option value="single-block">Single block</option>
          </select>
        </label>

        <p className="text-xs text-faint">
          Recognition runs in your browser. Language packs (1–4 MB each) download from this site on
          first use; your files are never uploaded.
        </p>
      </div>

      {phase === 'idle' && (
        <FileDropzone
          accept={ACCEPT}
          multiple
          onFiles={(files) => void run(files)}
          hint="PNG, JPEG, WebP or a scanned PDF. Several at a time"
        />
      )}

      {phase === 'preparing' && prepare && (
        <div className="rounded-lg border border-line bg-card p-6">
          <ProgressBar
            className="mx-auto max-w-md"
            value={
              prepare.status !== undefined
                ? undefined
                : prepare.total > 0
                  ? (prepare.loaded / prepare.total) * 100
                  : 0
            }
            label={
              prepare.status ??
              `Downloading OCR engine · ${transferLabel(prepare.loaded, prepare.total, prepare.speed)}`
            }
          />
          <div className="mx-auto mt-4 max-w-md text-center">
            <Button variant="ghost" size="sm" onClick={cancel}>
              <X className="size-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {phase === 'processing' && job && (
        <div className="rounded-lg border border-line bg-card p-6">
          <ProgressBar
            className="mx-auto max-w-md"
            value={job.progress * 100}
            label={
              (job.fileCount > 1 ? `File ${job.fileIndex + 1} of ${job.fileCount} · ` : '') +
              (job.pageCount !== null && job.pageCount > 1
                ? `page ${job.pageNumber} of ${job.pageCount}`
                : job.fileName)
            }
          />
          <p className="mx-auto mt-2 max-w-md truncate text-center font-mono text-[11px] text-faint">
            {job.fileName}
          </p>
          <div className="mx-auto mt-4 max-w-md text-center">
            <Button variant="ghost" size="sm" onClick={cancel}>
              <X className="size-3.5" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void run(filesRef.current)}>
              <RotateCcw className="size-4" />
              Retry
            </Button>
            <Button variant="ghost" onClick={reset}>
              Choose other files
            </Button>
          </div>
        </div>
      )}

      {pages.length > 0 && (
        <section className="mt-6 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-line pb-4">
            <span className="font-mono text-xs text-muted tabular-nums" role="status">
              {textPages.length} {textPages.length === 1 ? 'page' : 'pages'}
              {failedPages > 0 && ` · ${failedPages} failed`}
            </span>
            <CopyButton text={() => allText} label="Copy all" disabled={textPages.length === 0} />
            <Button
              variant="secondary"
              size="sm"
              disabled={textPages.length === 0}
              onClick={() =>
                downloadBlob(
                  new Blob([assembleTxt(textPages)], { type: 'text/plain' }),
                  outputFileName(baseName, 'txt'),
                )
              }
            >
              <Download className="size-3.5" />
              Download .txt
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={textPages.length === 0}
              onClick={() =>
                downloadBlob(
                  new Blob([assembleMd(textPages)], { type: 'text/markdown' }),
                  outputFileName(baseName, 'md'),
                )
              }
            >
              <Download className="size-3.5" />
              Download .md
            </Button>
            {!busy && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <ScanText className="size-3.5" />
                Other files
              </Button>
            )}
          </div>

          {pages.map((page) => {
            const quality = page.failure ? 'failed' : pageQuality(page)
            return (
              <article key={page.id} className="rounded-lg border border-line bg-card p-4">
                <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {pageTitle(page)}
                  </h2>
                  {!page.failure && quality !== 'empty' && (
                    <span
                      className={cx(
                        'rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums',
                        quality === 'ok'
                          ? 'bg-mint text-pine-deep'
                          : 'bg-amber-badge/15 text-amber-badge',
                      )}
                    >
                      {Math.round(page.confidence)}% confidence
                    </span>
                  )}
                  {!page.failure && page.text.trim().length > 0 && <CopyButton text={page.text} />}
                </header>

                {page.failure ? (
                  <p
                    role="alert"
                    className="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400"
                  >
                    <FileWarning className="mt-0.5 size-4 shrink-0" />
                    {page.failure}
                  </p>
                ) : quality === 'empty' ? (
                  <p className="flex items-start gap-1.5 text-sm text-muted">
                    <FileWarning className="mt-0.5 size-4 shrink-0" />
                    No text found on this page.
                  </p>
                ) : (
                  <>
                    {quality === 'low' && (
                      <p
                        role="status"
                        className="mb-2 flex items-start gap-1.5 text-xs text-amber-badge"
                      >
                        <FileWarning className="mt-0.5 size-3.5 shrink-0" />
                        Low confidence (under {LOW_CONFIDENCE}%) — the page may be blurry, skewed,
                        or not in the selected language.
                      </p>
                    )}
                    <pre className="max-h-96 overflow-auto rounded-md border border-line bg-page p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink">
                      {page.text}
                    </pre>
                  </>
                )}
              </article>
            )
          })}
        </section>
      )}
    </ToolLayout>
  )
}
