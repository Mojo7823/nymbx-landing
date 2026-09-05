import type { Worker as TesseractWorker } from 'tesseract.js'
import type { PrefetchItem } from '../../lib/prefetch'

/**
 * Everything that decides *where* the OCR engine and its language data come
 * from lives here.
 *
 * tesseract.js defaults to jsDelivr for its worker script and WASM core and to
 * tessdata.projectnaptha.com for language data. The site's privacy invariant
 * forbids that, so every path below resolves to our own origin:
 *
 *   public/ocr/engine/<tesseract.js version>/   copied from node_modules by
 *                                               scripts/copy-model-assets.mjs
 *   public/ocr/lang/<tessdata_fast version>/    committed (see its SOURCES.md)
 *
 * `cacheMethod: 'none'` keeps the language data out of IndexedDB — that store
 * is for settings and drafts only. Repeat visits are covered by the HTTP cache
 * instead: both directories are versioned and served `immutable` by
 * deploy/Caddyfile.
 */

/** Directory name under `public/ocr/lang/`. Bump together with SOURCES.md. */
export const LANG_VERSION = '4.1.0'

export type OcrLangId = 'eng' | 'chi_tra' | 'chi_sim' | 'ind'

export interface OcrLanguage {
  id: OcrLangId
  label: string
  nativeLabel: string
  /** Exact size of `<id>.traineddata.gz`, for byte-level download progress. */
  bytes: number
}

/** Mirrors public/ocr/lang/4.1.0/SOURCES.md — update both together. */
export const LANGUAGES: readonly OcrLanguage[] = [
  { id: 'eng', label: 'English', nativeLabel: 'English', bytes: 1_976_293 },
  { id: 'chi_tra', label: 'Traditional Chinese', nativeLabel: '繁體中文', bytes: 1_663_208 },
  { id: 'chi_sim', label: 'Simplified Chinese', nativeLabel: '简体中文', bytes: 1_723_430 },
  { id: 'ind', label: 'Indonesian', nativeLabel: 'Bahasa Indonesia', bytes: 609_584 },
]

export const DEFAULT_LANGS: OcrLangId[] = ['eng']

export type OcrLayout = 'auto' | 'single-block'

/** Narrow an unknown persisted value back to a usable language selection. */
export function normalizeLangs(value: unknown): OcrLangId[] {
  if (!Array.isArray(value)) return DEFAULT_LANGS
  const known = LANGUAGES.map((l) => l.id)
  const picked = known.filter((id) => value.includes(id))
  return picked.length > 0 ? picked : DEFAULT_LANGS
}

/** `'eng'`, `'chi_tra+eng'` — the `langs` argument of `createWorker`. */
export function langsParam(ids: readonly OcrLangId[]): string {
  return ids.join('+')
}

/**
 * Absolute URL for a file under `public/`, honouring a non-root deploy base.
 * `base` is injected for tests; production passes `import.meta.env.BASE_URL`.
 * Never adds a trailing slash — `langPath` must not have one.
 */
export function publicUrl(relative: string, base: string = import.meta.env.BASE_URL): string {
  const prefix = base.endsWith('/') ? base : `${base}/`
  return new URL(`${prefix}${relative.replace(/^\/+/, '')}`, window.location.href).toString()
}

/** Directory holding `<lang>.traineddata.gz`. No trailing slash. */
export function langPath(base?: string): string {
  return publicUrl(`ocr/lang/${LANG_VERSION}`, base)
}

export function workerPath(engineVersion: string, base?: string): string {
  return publicUrl(`ocr/engine/${engineVersion}/worker.min.js`, base)
}

/** Directory, not a file: tesseract.js picks the core variant for the device. */
export function corePath(engineVersion: string, base?: string): string {
  return publicUrl(`ocr/engine/${engineVersion}/core`, base)
}

export interface EngineManifest {
  version: string
  /** Path relative to the version directory → exact byte size. */
  files: Record<string, number>
}

/**
 * Read the manifest written by scripts/copy-model-assets.mjs. It carries the
 * engine version (so nothing has to hard-code it) and the exact file sizes the
 * prefetch progress bar needs.
 */
export async function loadEngineManifest(signal?: AbortSignal): Promise<EngineManifest> {
  const response = await fetch(publicUrl('ocr/engine/manifest.json'), { signal })
  if (!response.ok) throw new Error(`OCR engine manifest returned HTTP ${response.status}`)
  const manifest = (await response.json()) as EngineManifest
  if (typeof manifest.version !== 'string' || typeof manifest.files !== 'object') {
    throw new Error('OCR engine manifest is malformed')
  }
  return manifest
}

/**
 * The single core build this device will actually load.
 *
 * This mirrors tesseract.js's own selection in
 * node_modules/tesseract.js/src/worker-script/browser/getCore.js exactly, for
 * `lstmOnly` (which follows from the OEM below). Only that one file is
 * prefetched — the six variants together are ~26 MB. If the two ever disagree
 * the worst case is a wasted download plus a progress-free one, not a failure.
 */
export async function coreFileFor(engineVersion: string, base?: string): Promise<string> {
  const { relaxedSimd, simd } = await import('wasm-feature-detect')
  const [hasRelaxed, hasSimd] = [await relaxedSimd(), await simd()]
  const file = hasRelaxed
    ? 'tesseract-core-relaxedsimd-lstm.wasm.js'
    : hasSimd
      ? 'tesseract-core-simd-lstm.wasm.js'
      : 'tesseract-core-lstm.wasm.js'
  return `${corePath(engineVersion, base)}/${file}`
}

/** Files to warm the HTTP cache with before handing over to tesseract.js. */
export async function enginePrefetchItems(manifest: EngineManifest): Promise<PrefetchItem[]> {
  const coreUrl = await coreFileFor(manifest.version)
  const coreKey = `core/${coreUrl.split('/').pop()!}`
  const items: PrefetchItem[] = []
  const workerSize = manifest.files['worker.min.js']
  if (workerSize) items.push({ url: workerPath(manifest.version), size: workerSize })
  const coreSize = manifest.files[coreKey]
  if (coreSize) items.push({ url: coreUrl, size: coreSize })
  return items
}

export function langPrefetchItems(ids: readonly OcrLangId[]): PrefetchItem[] {
  const path = langPath()
  return LANGUAGES.filter((l) => ids.includes(l.id)).map((l) => ({
    url: `${path}/${l.id}.traineddata.gz`,
    size: l.bytes,
  }))
}

export interface OcrProgress {
  status: string
  /** 0–1. */
  progress: number
}

export interface CreateOcrWorkerOptions {
  langs: readonly OcrLangId[]
  layout: OcrLayout
  engineVersion: string
  onProgress: (progress: OcrProgress) => void
}

/**
 * Create the tesseract.js worker. The library manages its own Web Worker, so
 * this is deliberately not wrapped in a Comlink worker of ours.
 *
 * The import is dynamic so tesseract.js only reaches the bundle of this route.
 */
export async function createOcrWorker({
  langs,
  layout,
  engineVersion,
  onProgress,
}: CreateOcrWorkerOptions): Promise<TesseractWorker> {
  const { createWorker, OEM } = await import('tesseract.js')
  const worker = await createWorker(langsParam(langs), OEM.LSTM_ONLY, {
    workerPath: workerPath(engineVersion),
    corePath: corePath(engineVersion),
    langPath: langPath(),
    gzip: true,
    // Settings and drafts only in IndexedDB; the HTTP cache covers repeats.
    cacheMethod: 'none',
    logger: (m) => onProgress({ status: m.status, progress: m.progress }),
    errorHandler: (err: unknown) => console.error('[ocr]', err),
  })
  await applyLayout(worker, layout)
  return worker
}

export async function applyLayout(worker: TesseractWorker, layout: OcrLayout): Promise<void> {
  const { PSM } = await import('tesseract.js')
  await worker.setParameters({
    // tesseract.js defaults to SINGLE_BLOCK; AUTO does real layout analysis,
    // which is what a scanned page needs.
    tessedit_pageseg_mode: layout === 'auto' ? PSM.AUTO : PSM.SINGLE_BLOCK,
    // Pages are rendered at 300 DPI; telling Tesseract avoids a size warning
    // and improves its estimates.
    user_defined_dpi: '300',
    preserve_interword_spaces: '1',
  })
}

export interface RecognizedPage {
  text: string
  /** Mean word confidence, 0–100. */
  confidence: number
}

export async function recognizePage(
  worker: TesseractWorker,
  image: File | HTMLCanvasElement,
): Promise<RecognizedPage> {
  const { data } = await worker.recognize(image, {}, { text: true, blocks: false })
  return { text: data.text ?? '', confidence: data.confidence ?? 0 }
}

/** Switch languages / layout on an existing worker instead of recreating it. */
export async function reinitOcrWorker(
  worker: TesseractWorker,
  langs: readonly OcrLangId[],
  layout: OcrLayout,
): Promise<void> {
  const { OEM } = await import('tesseract.js')
  await worker.reinitialize(langsParam(langs), OEM.LSTM_ONLY)
  await applyLayout(worker, layout)
}
