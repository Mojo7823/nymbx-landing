# Phase 51 Handout — OCR (image / scanned PDF → text)

**Audience:** the agent implementing Phase 51 (T1) and the agents verifying it (T2–T4). This document is self-contained; read it fully before writing code. The roadmap is [/PLAN.md](../../PLAN.md) and the binding rules are [/CLAUDE.md](../../CLAUDE.md) — both are authoritative if anything here seems ambiguous.

---

## 1. Goal

Add the **OCR** tool at `/tools/ocr` (`src/tools/ocr/`): drop images or a scanned PDF, get the recognized text back, per page, with confidence — entirely in the browser. It closes the gap the PDF → image / markdown tool (Phase 13) already advertises ("scanned PDFs need OCR").

Registry entry already exists in `src/tools/registry.ts` (`slug: 'ocr'`, `phase: 51`, `status: soon`, icon `ScanText`). Flip it to `'available'` and register the lazy route in `src/tools/routes.ts` (`'ocr': lazy(() => import('./ocr/Ocr'))`). In `src/lib/registry.test.ts`, insert `'ocr'` into the "available" list right after `'zip-unzip'` (the list must follow registry order).

## 2. Privacy invariant — the hard part of this phase

`tesseract.js` by default loads its worker script from jsDelivr, its WASM core from jsDelivr, and language data from `tessdata.projectnaptha.com`. **None of that is allowed.** Everything must be served from our own origin under `public/ocr/`, and the browser network log while OCR-ing a file must show only same-origin GETs and never image bytes. This is verified in T2 with a real network capture.

## 3. Library facts (tesseract.js 7.x, verified against the docs via context7 on 2026-09-05)

Install `tesseract.js@^7` (it pulls `tesseract.js-core@^7`). Import it **lazily inside the tool module only** (`const { createWorker, PSM } = await import('tesseract.js')`) so the dashboard bundle stays light; confirm with `npm run build` that no dashboard chunk grows.

- `createWorker(langs, oem = 1, options)` — `langs` is `'eng'` or `['eng', 'chi_tra']` (equivalent to `'eng+chi_tra'`). Options that matter here:
  - `workerPath` — URL of `worker.min.js`.
  - `corePath` — URL of a **directory** that must contain all four core files: `tesseract-core.wasm.js`, `tesseract-core-simd.wasm.js`, `tesseract-core-lstm.wasm.js`, `tesseract-core-simd-lstm.wasm.js` (plus their `.wasm` siblings). Tesseract.js picks the variant for the device. Pointing at a single file is discouraged by the docs.
  - `langPath` — URL of the directory holding `<lang>.traineddata.gz`. **No trailing slash.**
  - `gzip: true` (default) — remote traineddata is gzipped.
  - `cacheMethod: 'none'` — do not persist language data in IndexedDB; rely on the HTTP cache with immutable headers (same strategy as the Phase 8 model shards). Keeps the "IndexedDB is for drafts/settings only" rule simple.
  - `logger: (m) => …` — messages `{ workerId, jobId, status, progress }`; `status` values include `'loading tesseract core'`, `'initializing tesseract'`, `'loading language traineddata'`, `'initializing api'`, `'recognizing text'`; `progress` is 0–1. Use `'recognizing text'` progress for the per-page bar.
  - `errorHandler: (err) => …`.
  - `workerBlobURL` (default `true`) — the worker script is fetched and started from a blob URL. Same-origin, so fine under COOP/COEP; if the preview server's `Cross-Origin-Embedder-Policy: require-corp` causes trouble, set it to `false` and document why.
- `worker.recognize(image, options?, output?)` — in the browser `image` may be a `File`, `Blob`, `<img>`, `<canvas>` or `ImageData`. `output` defaults to `{ text: true }`; request `{ text: true, blocks: true }` when you need per-line confidence. Result: `data.text` (string), `data.confidence` (mean word confidence 0–100), `data.blocks` (raw Tesseract JSON: paragraphs → lines → words with `confidence` and `bbox`).
- `worker.reinitialize(langs, oem?)` — switch languages without recreating the worker.
- `worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO | PSM.SINGLE_BLOCK, user_defined_dpi: '300', preserve_interword_spaces: '1' })` — `oem` cannot be changed this way (needs `reinitialize`). Default PSM in tesseract.js is `SINGLE_BLOCK`; for scanned pages `AUTO` is the better default — expose both.
- `worker.terminate()` — call on unmount and on Cancel.

## 4. Self-hosting layout

```
public/ocr/
  engine/<tesseract.js version>/          ← gitignored, copied at predev/prebuild
    worker.min.js                          ← from node_modules/tesseract.js/dist/
    core/                                  ← every *.js and *.wasm from node_modules/tesseract.js-core/
  lang/<tessdata_fast version>/            ← COMMITTED to git (there is no npm package for it)
    eng.traineddata.gz  chi_tra.traineddata.gz  chi_sim.traineddata.gz  ind.traineddata.gz
    SOURCES.md                             ← upstream URLs + commit, license note, SHA-256 of each file
```

- Extend `scripts/copy-model-assets.mjs` (it already self-hosts the background-removal model, the zxing reader and the Noto font with a skip-if-current version stamp) with the engine copy. Read the version from `node_modules/tesseract.js/package.json` and stamp it the same way. Add `public/ocr/engine` to `.gitignore`.
- Language packs: download the four files from the official `tesseract-ocr/tessdata_fast` GitHub repository (Apache-2.0; `raw.githubusercontent.com/tesseract-ocr/tessdata_fast/<commit>/<lang>.traineddata`), gzip them deterministically (`gzip -9 -n`), and commit them under `public/ocr/lang/<version>/`. Record the upstream commit SHA and each file's SHA-256 in `SOURCES.md`. Expected sizes are roughly 4 MB (eng), 2.5 MB (chi_tra), 2.4 MB (chi_sim), 1.4 MB (ind) — the repo already commits 44 MB of video under `public/itsme`, so ~10 MB of language data is within convention.
- Export the resolved paths from one place (`src/tools/ocr/ocrEngine.ts`): `workerPath`, `corePath`, `langPath`, and a `LANGUAGES` catalog `{ id: 'eng' | 'chi_tra' | 'chi_sim' | 'ind', label, nativeLabel, bytes }` with the exact gzipped byte sizes (needed for byte-level prefetch progress). Build URLs with `import.meta.env.BASE_URL` so they work at any base path.
- `deploy/Caddyfile`: add immutable cache headers for `/ocr/engine/*` and `/ocr/lang/*` (both are under versioned directories, so `public, max-age=31536000, immutable` is correct). Follow the existing `@model_chunks` block.

## 5. Prefetch (reuse the Phase 8 pattern)

`src/tools/background-remover/modelPrefetch.ts` contains a proven streaming downloader (byte-level progress, per-chunk stall watchdog with 30 s default, 3 attempts, `AbortSignal` cancel, `PrefetchError` / `PrefetchCancelled`). It is currently tied to the background-removal `resources.json` catalog.

Refactor, do not duplicate: move the generic part into **`src/lib/prefetch.ts`** exporting

```ts
export interface PrefetchItem { url: string; size: number }
export function prefetchUrls(items: PrefetchItem[], onProgress: (p: { loaded: number; total: number }) => void, signal: AbortSignal, options?: { stallTimeoutMs?: number; maxAttempts?: number }): Promise<void>
export class PrefetchError extends Error {}
export class PrefetchCancelled extends PrefetchError {}
```

and make `modelPrefetch.ts` a thin catalog-reading wrapper over it. The existing `modelPrefetch.test.ts` and the background-remover behaviour must stay green — run the full test suite. Add `src/lib/prefetch.test.ts` (happy path, stall → retry → success, stall → exhaustion → `PrefetchError`, cancel → `PrefetchCancelled`, size mismatch).

For OCR, prefetch the engine files (`worker.min.js`, the four `.wasm.js` and four `.wasm` — sizes read from the copy script into a small generated `manifest.json` next to them, or hard-coded from `package.json` versions; either is fine as long as sizes are exact) plus the selected language packs before creating the worker. Because the files are served immutable, tesseract.js's own fetches then resolve from the browser cache.

## 6. UX specification

Use `ToolLayout` (`title="OCR"`, `description="Extract text from images and scanned PDFs, in your browser"`, `badge="client-side"`) and `FileDropzone` (`accept="image/png,image/jpeg,image/webp,application/pdf"`, `multiple`). Follow the visual conventions of the existing tools (look at `src/tools/pdf-to-image-markdown/PdfToImageMarkdown.tsx` and `src/tools/background-remover/BackgroundRemover.tsx` for the closest patterns: PDF rendering and model-download UX respectively).

1. **Options row** (visible before and after dropping):
   - **Languages** — checkbox chips: `English (eng)` default on, `繁體中文 (chi_tra)`, `简体中文 (chi_sim)`, `Bahasa Indonesia (ind)`. At least one must stay selected. Show the download size next to each not-yet-cached pack ("~2.5 MB"). Persist the selection with the settings store (`src/lib/settings.ts`) — that is settings, not user files, so it is allowed.
   - **Layout** — select: `Auto (default)` = `PSM.AUTO`, `Single block` = `PSM.SINGLE_BLOCK`.
   - A one-line privacy note: "Recognition runs in your browser. Language packs (1–4 MB each) download from this site on first use; your files are never uploaded."
2. **Engine preparation state** — after the first drop: progress bar with `Downloading OCR engine · 3.2 MB of 9.8 MB · 1.1 MB/s` (reuse `prefetchLabel`-style formatting from `src/lib/format.ts`), a **Cancel** button, and on failure a clear error with **Retry**. Never a spinner without numbers, never a hang (the stall timeout guarantees that).
3. **Processing** — items run **sequentially**; the overall line reads `File 2 of 3 · page 4 of 12`, the per-page bar follows the `'recognizing text'` progress. PDFs are rendered page by page with pdf.js at 300 DPI (`scale = 300 / 72`) into an offscreen canvas that is passed to `recognize`; render one page at a time and release it, never all pages up front. Copy the pdf.js setup from Phase 13 (`await import('pdfjs-dist')`, `GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()`), including its `PasswordException` handling and wording: "This PDF is password-protected. Remove the password first; encrypted files are not supported." A **Cancel** button terminates the worker and keeps the pages already finished.
4. **Results** — one card per page: header `scan.pdf · page 3` (or the image name), a confidence badge (`87% confidence`), the text in a read-only `<pre>` with wrap, and a Copy button. Confidence below **60** shows a warning: "Low confidence — the page may be blurry, skewed, or not in the selected language." A page with fewer than 3 recognized words shows "No text found on this page." Never silently show garbage as if it were fine.
5. **Global actions** — Copy all, Download `.txt` (pages joined by a blank line and a `---` line), Download `.md` (`## scan.pdf — page 3` heading per page). Filenames derive from the first source file (`scan.ocr.txt`).
6. **Empty / error states** — unsupported file type toast; oversize handling like other tools; engine failure with Retry; a worker crash surfaces as an error card for that page and processing continues with the next.
7. **Lifecycle** — one worker, created lazily, `reinitialize` when the language set changes, `terminate` on unmount and on Cancel. Guard late progress callbacks after cancel the same way `createProgressGuard` in `src/lib/worker.ts` does.

## 7. Code layout

```
src/tools/ocr/
  Ocr.tsx              page component (state machine: idle → preparing → processing → done, with error)
  ocrEngine.ts         paths, LANGUAGES catalog, createOcrWorker(), recognizePage(), PSM mapping
  pdfPages.ts          async generator: File → { pageNumber, canvas } at a given DPI (pdf.js), PasswordException → typed error
  ocrText.ts           pure helpers: confidence class, assembleTxt(), assembleMd(), wordCount(), outputFileName()
  ocrText.test.ts      unit tests for the pure helpers (incl. CJK text without spaces, empty pages, thresholds)
  ocrEngine.test.ts    URL building (BASE_URL handling, no trailing slash), language catalog integrity (ids, sizes > 0), langs string
src/lib/prefetch.ts + prefetch.test.ts          (see §5)
```

Keep React state minimal and derive everything else. No `any`; strict TS. Web Worker for tesseract is the library's own — do **not** wrap it in an extra Comlink worker.

## 8. Tasks (T1 — do in order; run `npm run lint` and `npm run typecheck` after each step, and `npm run test` at the end)

1. `npm i tesseract.js@^7` — check `npm ls tesseract.js tesseract.js-core` resolves to 7.x for both. If npm refuses a postinstall script (the package has an `opencollective-postinstall` dependency), do **not** disable script checks globally; add a targeted `allowScripts` entry like the existing `protobufjs` one and say so in your report.
2. Language packs: download, gzip, `SOURCES.md`, commit-ready under `public/ocr/lang/<version>/`.
3. Extend `scripts/copy-model-assets.mjs`; add `public/ocr/engine` to `.gitignore`; run `node scripts/copy-model-assets.mjs` and confirm the files land.
4. `src/lib/prefetch.ts` refactor + tests; `modelPrefetch.ts` rewired; full test suite green.
5. `src/tools/ocr/*` per §6–7 with unit tests.
6. Routes, registry status, registry test.
7. `deploy/Caddyfile` cache headers.
8. `npm run build` — confirm the OCR chunk is separate and the dashboard entry chunk size is unchanged versus `git stash`-free main (compare `dist/assets/index-*.js` size before/after).
9. Smoke it yourself once in a real browser (Python Playwright is installed; `npx vite preview --port 4173 --strictPort --host 127.0.0.1` serves the production build with the COOP/COEP headers from `vite.config.ts`): drop a PNG with English text, confirm text comes back and that every request in the network log is a same-origin GET.

Do not commit; report what you changed, what you verified, and anything you had to decide that this handout did not cover.

## 9. Verification (T2/T3, by the verifier)

Test assets (generate with Python Pillow, installed in the user site; fonts: DejaVu Sans for Latin, `public/fonts/NotoSansTC-Regular.ttf` for Traditional Chinese, a system CJK font for Simplified if available):
- `eng-300dpi.png`: 3 paragraphs of English at ~300 DPI, black on white.
- `ind-300dpi.png`: Indonesian sentence(s).
- `zh-tw-300dpi.png`: a Traditional Chinese paragraph.
- `mixed.pdf`: a 3-page PDF built from those PNGs (Pillow can save multi-page PDF) — a "scanned" PDF with no text layer.
- `garbage.png`: random noise; `blank.png`: white page.
- `encrypted.pdf`: any PDF with a user password (pypdf is installed).

Checks:
- Each clean image reaches usable accuracy in its language (≥ 90 % of words correct for English/Indonesian; visibly correct Chinese for the CJK sample); switching the language set changes the result accordingly.
- **Network log**: every request during engine load and recognition is a GET to `http://127.0.0.1:4173/…`; no request body ever contains image bytes; nothing to jsDelivr or projectnaptha.
- Multi-page PDF: per-page progress visible, UI stays responsive (a click on Cancel is honoured within a second), finished pages remain after Cancel.
- `garbage.png` and `blank.png` produce the low-confidence / no-text messaging, not silent garbage.
- `encrypted.pdf` shows the password error; unsupported type shows a toast.
- Engine download failure path: block `/ocr/engine/*` in Playwright (`route.abort()`) → error + Retry appear within the stall timeout, no hang.
- COOP/COEP: run against `vite preview` (headers on) — the worker starts and WASM loads.
- Visual (T3): 1280 px and 390 px, light and dark, for the idle state, the preparing state, the results state with a low-confidence card, and the error state. No horizontal overflow (`document.documentElement.scrollWidth <= viewport`).

## 10. Definition of done

- `npm run lint`, `npm run typecheck`, `npm run test` pass with zero errors.
- Every check in §9 passes on a fresh production build (`npm run build && vite preview`) — that is T4.
- PLAN.md Phase 51 needs no text change unless a decision here diverged from it; if it did, update PLAN.md in the same commit and say so.
