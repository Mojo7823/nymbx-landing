# NYMBX Toolbox — Implementation Plan

A privacy-first, browser-based all-in-one toolbox. **All processing happens client-side** — user files never leave the device, except for explicitly labeled "server-assisted" tools (currently only DOCX ↔ PDF conversion).

## Stack

| Layer | Choice |
|---|---|
| Build / framework | Vite + React 19.2 + TypeScript (strict) |
| Styling | Tailwind CSS |
| Routing | React Router, one lazy-loaded route per tool |
| Heavy work | Web Workers (Comlink), WASM where needed |
| Local persistence | IndexedDB via `idb` (drafts, settings — never user files) |
| Hosting | Zeabur, Dockerfile-based. Web service: multi-stage image (Node build → Caddy serving `dist` with COOP/COEP headers + SPA fallback). Gotenberg runs as a second private-only Zeabur service, reached via `gotenberg.zeabur.internal` |
| Testing | Vitest (unit), Playwright via webapp-testing (visual/E2E) |

## Working rules (apply to every phase)

1. **One tool per phase.** A phase is not complete until all four of its tasks pass.
2. **Quality gate on every task:** before a task can be marked complete, the agent MUST run `npm run lint` and `npm run typecheck` and both MUST pass with zero errors. No exceptions, no deferred fixes.
3. **Privacy invariant:** no network request may carry user file content, except in tools explicitly labeled server-assisted. Verification tasks must confirm this (check the browser network log while exercising the tool).
4. **Lazy loading:** each tool's heavy dependencies load only when its route is opened. Verify bundle impact when adding a library.
5. Do not start phase N+1 while phase N has open defects.

## Standard task template (every phase uses this)

Each phase consists of exactly these four tasks:

- **T1 — Implementation.** Build the tool page, wire it into the dashboard and router.
  *Rule: run `npm run lint` and `npm run typecheck`; both must pass before completion.*
- **T2 — Functional verification.** Exercise the tool end-to-end with the phase's listed test cases, including edge cases and the privacy check (no user-file bytes in network requests). Fix everything found.
  *Rule: run `npm run lint` and `npm run typecheck`; both must pass before completion.*
- **T3 — Visual inspection.** Load the tool in a real browser (Playwright), screenshot desktop (1280px) and mobile (390px) viewports, in light and dark mode. Check layout, overflow, spacing, empty states, loading states, error states.
  *Rule: run `npm run lint` and `npm run typecheck`; both must pass before completion.*
- **T4 — Second-pass visual verification (final).** After all T2/T3 fixes have landed, do a fresh production build (`npm run build && npm run preview`), re-screenshot both viewports, and confirm every previously found issue is resolved and no regression appeared. This task closes the phase.
  *Rule: run `npm run lint` and `npm run typecheck`; both must pass before completion.*

---

## Phase 0 — Foundation (build this first)

**Goal:** the base application — no tools yet. What a user sees when they first open the site, plus the shared plumbing every tool will reuse.

**Scope:**
- Scaffold Vite + React + TS (strict mode) + Tailwind + React Router.
- `npm` scripts: `dev`, `build`, `preview`, `lint` (ESLint + Prettier check), `typecheck` (`tsc --noEmit`), `test` (Vitest).
- **Dashboard home page:** grid of tool cards grouped by category (Markdown / Image / Files / PDF / Converters), each card with icon, name, one-line description, and a "client-side" or "server-assisted" badge. Cards for unbuilt tools show a "coming soon" state.
- App shell: header with site name + theme toggle (light/dark, persisted), category sidebar or filter, footer with the privacy statement ("your files never leave this device").
- Shared components: `FileDropzone` (drag & drop + picker, multi-file), `ToolLayout` (consistent page frame: title, description, privacy badge), `Button`, `Toast`, `ProgressBar`, `CopyButton`.
- Shared utilities: `downloadBlob()`, `downloadZip()` (fflate), `formatBytes()`, worker helper (Comlink wrapper), IndexedDB settings store.
- 404 page.
- **Deployment container:** multi-stage `Dockerfile` at the repo root (Zeabur auto-detects it): Node stage builds the app, final stage is `caddy:alpine` serving `dist` with a minimal `deploy/Caddyfile` — SPA fallback (`try_files … /index.html`), `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (required later by multithreaded WASM), and a placeholder for the future `/api/convert/*` reverse proxy. Container must respect Zeabur's `PORT` env var.
- Remove the old demo files (`test.html`, `home/`, old `index.html`, `vendor/`, `_headers`, `_redirects`) once the scaffold replaces them.

**Verification (T2):** dev server runs; production build succeeds; `docker build` succeeds and the container serves the site locally with the COOP/COEP headers present (check with `curl -I`) and SPA deep links working; theme toggle persists across reload; all category groups render; dropzone accepts drag and picker input; 404 route works; `downloadBlob` produces a valid file.
**Visual (T3/T4):** dashboard at both viewports, both themes; card grid wraps correctly on mobile; empty "coming soon" cards look intentional.

---

## Group A — Markdown tools

### Phase 1 — Em-dash remover
The simplest tool; validates the whole tool-page pattern end-to-end.
- **Libraries:** none.
- **Build:** textarea input → live output replacing `—` (and optionally `–`, configurable) with `-`, `, `, or removal; replacement-count indicator; copy button; paste-and-go UX.
- **Verify:** em-dash mid-word, at line start/end, multiple per line, empty input, 1 MB+ pasted text stays responsive, no network activity.

### Phase 2 — Double line remover
- **Libraries:** none.
- **Build:** collapse 2+ consecutive blank lines to one (option: to zero); trim trailing whitespace option; before/after line counts.
- **Verify:** CRLF vs LF input, whitespace-only "blank" lines, file entirely of newlines, idempotency (running twice = running once).

### Phase 3 — Diff checker
- **Libraries:** `diff` (jsdiff), CodeMirror 6 merge view.
- **Build:** two-pane input, side-by-side and inline diff views, char/word/line granularity toggle, ignore-whitespace option, copy unified diff.
- **Verify:** identical inputs (explicit "no differences"), one side empty, 10k-line files stay responsive (worker if needed), unicode/emoji diffs correct.

### Phase 4 — Markdown renderer
- **Libraries:** `markdown-it`, `DOMPurify`, `shiki` (lazy).
- **Build:** editor pane + live preview; GFM (tables, task lists, strikethrough); syntax-highlighted code blocks; export rendered HTML; print-friendly view.
- **Verify:** **XSS test is mandatory** — `<script>`, `onerror=` images, `javascript:` links must all be neutralized by DOMPurify; large documents; malformed markdown never crashes the page.

### Phase 5 — Mermaid editor + renderer
- **Libraries:** `mermaid` (lazy), CodeMirror 6.
- **Build:** code editor + live-rendered diagram; debounced render; syntax-error display without losing last good render; export SVG and PNG; starter templates (flowchart, sequence, gantt).
- **Verify:** each major diagram type renders; invalid syntax shows the error and keeps the previous diagram; SVG/PNG exports open correctly; theme matches app dark/light mode.

### Phase 6 — Markdown editor (full)
The capstone of the markdown group — reuses Phases 4–5 components.
- **Libraries:** CodeMirror 6, `markdown-it` + `DOMPurify` (from Phase 4), `idb`.
- **Build:** toolbar (bold, italic, headings, lists, quote, code, link, table); image attachment via link URL **or** local file embedded as base64 data-URI (with a size warning); split-pane live preview; autosave drafts to IndexedDB; export `.md`; mermaid code blocks rendered in preview (reuse Phase 5).
- **Verify:** every toolbar action produces correct markdown around the current selection; base64 image survives export/reimport; draft survives page reload; XSS checks from Phase 4 still hold in preview.

---

## Group B — Image tools

### Phase 7 — Image resize
- **Libraries:** `pica`.
- **Build:** dropzone → full-viewport preview; resize by pixels, percentage, preset, or target file size (quality search + downscale fallback, JPEG/WebP); lock aspect ratio; output format (PNG/JPEG/WebP) + quality slider; before/after file size; batch mode with zip download.
- **Verify:** upscale and downscale quality; EXIF orientation handled (photo from phone isn't rotated); transparent PNG stays transparent; 50 MP image doesn't freeze the UI (worker/OffscreenCanvas); batch of 20 files zips correctly.

### Phase 8 — Background remover
- **Libraries:** `@imgly/background-removal` (lazy; self-host model assets under `public/models/` via `publicPath`).
- **Build:** dropzone → progress UI for model download (first use, ~40–80 MB, with clear messaging) → processed result over a checkerboard; download PNG; model preloading after first visit; WebGPU with CPU fallback.
- **Verify:** portrait, product-on-white, and complex-edge (hair/fur) images; model download progress reports correctly; works with COOP/COEP headers active; **network log shows model downloads only from our origin, never image uploads**; graceful failure message on very low-memory devices.
- **Download robustness fix (2026-09-04):** the library fetches ~4 MB model shards in parallel and reports progress per *completed* shard with no timeout, so slow/stalling connections froze the UI at e.g. "106 KB of 84.1 MB 0%" forever with no way to cancel. The tool now prefetches model shards sequentially with streaming byte-level progress, download speed, a 30 s per-chunk stall timeout with 3 retries, a clear error instead of a hang, and a Cancel button; shards are content-hashed and served immutable (`deploy/Caddyfile`) so the library's own fetch resolves from browser cache. See `src/tools/background-remover/modelPrefetch.ts`.

---

## Group C — File tools

### Phase 9 — Bulk file hasher
- **Libraries:** `hash-wasm`, Comlink worker.
- **Build:** multi-file dropzone; algorithms SHA-256 / SHA-1 / SHA-512 / MD5 / CRC32; streaming chunked hashing in a worker with per-file progress; results table with copy-per-hash; export results as CSV/TXT; "compare against expected hash" field.
- **Verify:** hash a file with a known published hash (e.g. verify against `sha256sum` locally) — values must match exactly; 2 GB file hashes without crashing (streaming, not full read); 100-file batch; empty file (known constant hashes).

### Phase 10 — Bulk file renamer
- **Libraries:** `fflate`.
- **Build:** user drops/selects files into the browser → pattern-based renaming (find/replace, regex option, prefix/suffix, sequential numbering with padding, case transforms) → live preview table (old name → new name) with conflict detection → export all renamed files as a single compressed zip. Original files on disk are never touched. Works identically in all browsers.
- **Verify:** collision detection (two files mapping to one name blocks the export); regex with capture groups; preview always matches zip contents exactly; zip entries are compressed and open correctly in an external archive tool; large batch (200 files / 1 GB total) streams into the zip without freezing the UI; file contents are byte-identical after the round trip.

---

## Group D — PDF tools

### Phase 11 — PDF split / extract
- **Libraries:** `pdf-lib`, `pdf.js` (page thumbnails), `fflate`.
- **Build:** dropzone → page thumbnail grid; select pages (click, ranges like `1-3,7,9-`); extract selection to one PDF; "split all" → one PDF per page, zipped; page count and size shown.
- **Verify:** 500-page PDF stays usable; encrypted PDF shows a clear error; range parser edge cases (`-3`, `9-`, overlaps, out-of-bounds); output opens in an external viewer; metadata preserved.

### Phase 12 — PDF resize
- **Libraries:** `pdf-lib`.
- **Build:** target size presets (A4, Letter, etc.) + custom dimensions; scale-content vs. crop/pad options (via `page.scale()` / `setSize()`); optional "reduce file size" mode (re-render via pdf.js at chosen DPI); before/after dimensions and size.
- **Verify:** mixed-orientation documents; content not distorted (aspect handling correct); annotations/links preserved with `setSize`; compress mode output is smaller and legible.

### Phase 13 — PDF → image / markdown
- **Libraries:** `pdf.js`.
- **Build:** render pages to PNG/JPEG at selectable DPI (single page or all pages zipped); text extraction → markdown with heading heuristics (font-size based); side note in UI: scanned PDFs need OCR (out of scope, planned).
- **Verify:** vector-heavy and image-heavy pages render correctly at 300 DPI; multi-column text extraction order is acceptable; PDF with no text layer shows the "scanned PDF" notice instead of an empty result.

---

## Group E — Converters

### Phase 14 — DOCX → HTML / Markdown
- **Libraries:** `mammoth`, `turndown` (HTML → MD).
- **Build:** dropzone → converted output with preview; download `.html` or `.md`; embedded images extracted as base64 or separate files in a zip; conversion warnings from mammoth surfaced to the user.
- **Verify:** headings/lists/tables/bold/italic map correctly; document with images; document with footnotes (graceful degradation); corrupt file shows a clean error.

### Phase 15 — DOCX ↔ PDF (server-assisted)
The only server-assisted tool. **Clearly labeled in the UI.**
- **Infra:** deploy the official `gotenberg/gotenberg` image as a second service in the same Zeabur project, **private networking only — no public domain**; the web container's Caddy adds `reverse_proxy /api/convert/* → gotenberg.zeabur.internal:3000` with a request size limit. A `docker-compose.yml` in `deploy/` mirrors the two-service setup for local development.
- **Build:** dropzone → upload with progress → converted file download; explicit banner: "This tool uploads your file to our server for conversion; it is deleted immediately after."; client-side file size cap; both directions (DOCX→PDF via Gotenberg LibreOffice route, PDF→DOCX if quality is acceptable — otherwise ship DOCX→PDF only and say so).
- **Verify:** conversion fidelity on a formatted document (tables, images, headers/footers); server rejects oversized files cleanly; Gotenberg unreachable → clear error, no hang; **confirm no temp files persist server-side after conversion**.
- **⚠ Open deployment TODO (code verified locally 2026-09-04 against real `gotenberg/gotenberg:8` via `deploy/docker-compose.yml`: formatted DOCX→valid PDF through the Caddy proxy, 413 on oversize, 502 with clean client message when Gotenberg is down, COOP/COEP headers + SPA fallback OK, no user bytes left in container /tmp):**
  1. Add the `gotenberg/gotenberg:8` service to the Zeabur project (private networking only, no public domain) so it resolves as `gotenberg.zeabur.internal`.
  2. Redeploy the web service to pick up the Caddyfile with the `/api/convert/*` proxy.
  3. Re-run the verification list above against the live site, including the no-temp-files check on real Gotenberg.

---

---

# Extension phases

Phases 16–52 extend the five groups. They follow the same standard four-task template and quality gates. Within a group they are ordered to maximize plumbing reuse; groups (and phases within them) may be reordered or pulled forward on demand — only Phase 53 (Polish & PWA) must remain last.

## Group F — PDF & office extensions

### Phase 16 — PDF merge
- **Libraries:** `pdf-lib` (reuses Phase 11 plumbing), `pdf.js` thumbnails.
- **Build:** multi-file dropzone; drag to order documents; first-page thumbnail per file; merged output download.
- **Verify:** page order matches the arranged order exactly; mixed page sizes/orientations preserved; two 100 MB files merge without freezing; encrypted input → clear error.

### Phase 17 — PDF page reorder / rotate / delete
- **Libraries:** `pdf-lib`, `pdf.js`.
- **Build:** thumbnail grid with drag-and-drop reordering, per-page and bulk rotate (90/180/270), delete with undo; save as new PDF.
- **Verify:** rotation displays correctly in an external viewer; output page order matches the grid; deleting all-but-one page works; undo restores exact prior state.

### Phase 18 — PDF watermark
- **Libraries:** `pdf-lib`.
- **Build:** text or image stamp; opacity, size, rotation (diagonal preset), position presets; apply to all pages or a range; live preview on first page.
- **Verify:** watermark position consistent across mixed orientations; opacity renders correctly in external viewers; text watermark with CJK characters (embed a Unicode font).

### Phase 19 — Images → PDF
- **Libraries:** `pdf-lib`.
- **Build:** multi-image dropzone with drag ordering; page-size options (fit image, A4 with margins); one image per page; output download.
- **Verify:** EXIF-rotated phone photos appear upright; mixed PNG/JPEG batch; 100-image batch stays responsive; image quality not visibly degraded.

### Phase 20 — PDF compress
- **Libraries:** `pdf.js` + `pdf-lib`.
- **Build:** re-render pages at target DPI/quality to shrink scanned or image-heavy PDFs; before/after size; **explicit warning that text becomes non-selectable (rasterized)**.
- **Verify:** meaningful size reduction on an image-heavy PDF; output legible at chosen DPI; text-only PDF warns that compression won't help / rasterizes.

### Phase 21 — XLSX / CSV viewer
- **Libraries:** SheetJS (`xlsx`, lazy).
- **Build:** read-only spreadsheet table with sheet tabs, column sort, text search, copy cell/range; virtualized rows for big sheets.
- **Verify:** multi-sheet workbook; formula cells show computed values; 100k-row sheet scrolls smoothly (virtualization); no network activity with the file open.

### Phase 22 — Markdown → DOCX
- **Libraries:** `markdown-it` token stream → `docx` library.
- **Build:** markdown input (or `.md` file) → downloadable `.docx`; headings, lists, tables, code blocks, links, images (from data-URI or URL fetch opt-in).
- **Verify:** output opens cleanly in Word and LibreOffice; heading levels map to Word styles; nested lists and tables correct; round-trip sanity vs Phase 14 (DOCX→MD→DOCX keeps structure).

### Phase 52 — PDF editor (overlay & annotate)
- **Libraries:** `pdf.js` (page rendering, reuses Phase 11/13 plumbing), `konva` + `react-konva` (interactive overlay layer, lazy), `perfect-freehand` (smoothed pen strokes), `pdf-lib` (export).
- **Build:** dropzone → page-by-page editor: pdf.js renders each page as the background, with a Konva canvas layer on top holding editable objects — text boxes (font, size, color), image stamps (PNG/JPEG, e.g. a scanned signature), freehand pen/brush for drawn signatures (adjustable color/width, smoothed via perfect-freehand), and basic shapes (rectangle, ellipse, line/arrow with stroke/fill options). Select/move/resize/rotate/delete any object; undo/redo; page navigation with per-page edits preserved; export the edited PDF. **Export strategy:** attempt real PDF annotation objects first (pdf-lib low-level API) so edits remain movable in Acrobat; if fidelity or cross-viewer compatibility falls short, fall back to flattening edits into page content (vector where possible — `drawText`, `drawSvgPath` for pen strokes, shape ops, embedded images). Whichever mode ships is stated plainly in the UI.
- **Verify:** exported objects land at pixel-correct positions and sizes regardless of editor zoom and across mixed page orientations; drawn signature stays sharp in the export (vector path, not blurry raster); text overlay with CJK characters (embed a Unicode font); undo/redo works across page switches; original dropped file is untouched; 100-page PDF stays responsive (render only visible pages); output opens correctly in browser viewers and Acrobat; no network activity while a file is loaded.

## Group G — Text & developer utilities

### Phase 23 — JSON formatter / validator / minifier
- **Libraries:** none (native `JSON.parse` + custom printer).
- **Build:** paste/drop JSON → pretty-print with configurable indent, minify, validate with error line/column highlighting; collapsible tree view; copy/download.
- **Verify:** precise error position on invalid JSON; 50 MB file stays responsive (worker); minify→format round trip is lossless; number precision preserved (no float mangling of big ints — flag them).

### Phase 24 — YAML ↔ JSON ↔ TOML converter
- **Libraries:** `js-yaml`, `smol-toml`.
- **Build:** three-way converter with auto-detected input format; error display with position; copy/download output.
- **Verify:** round-trips preserve data; YAML anchors/aliases expand correctly; comments-are-lost notice shown; TOML datetimes convert sanely.

### Phase 25 — CSV ↔ JSON converter
- **Libraries:** `papaparse`.
- **Build:** both directions; delimiter auto-detect + override; header row toggle; preview table; streaming for large files.
- **Verify:** quoted fields with embedded commas/newlines; semicolon and tab delimiters; 500 MB CSV streams without crashing; JSON array-of-objects with missing keys → consistent columns.

### Phase 26 — Base64 encoder / decoder
- **Libraries:** none (native + `FileReader`).
- **Build:** text mode and file mode; standard and URL-safe alphabets; data-URI output option; decode to text or binary download.
- **Verify:** UTF-8 text (CJK, emoji) round-trips exactly; binary file round-trips byte-identical; invalid base64 → clear error; 100 MB file encodes in a worker.

### Phase 27 — URL encoder / decoder / parser
- **Libraries:** none (native `URL` API).
- **Build:** encode/decode (component vs full-URL modes); parsed breakdown of a pasted URL (protocol, host, path, each query param decoded, hash).
- **Verify:** `encodeURIComponent` vs `encodeURI` behavior correct; repeated query keys listed separately; IDN/punycode domains displayed both ways; malformed URL → graceful error.

### Phase 28 — Regex tester
- **Libraries:** none (native `RegExp` in a worker).
- **Build:** pattern + flags input, test text with live match highlighting, capture-group table (named groups), replace preview; **execution in a worker with a timeout** to survive catastrophic backtracking.
- **Verify:** all flags behave; named + numbered groups displayed per match; a known ReDoS pattern times out with a message instead of freezing the tab; multiline anchors correct.

### Phase 29 — removed (text case converter, dropped from scope)

### Phase 30 — Word / character / token counter
- **Libraries:** none (`Intl.Segmenter`).
- **Build:** live counts: characters (with/without spaces), words, sentences, lines, paragraphs; approximate LLM token estimate; reading-time estimate.
- **Verify:** CJK text counts words via `Intl.Segmenter` (not space-splitting); emoji count as single characters (grapheme clusters); 1 MB text stays live.

### Phase 31 — UUID / ULID / password generator
- **Libraries:** none (`crypto.randomUUID`, `crypto.getRandomValues`), `ulid`.
- **Build:** UUID v4 (bulk), ULID, random passwords with charset toggles (length, symbols, exclude-ambiguous) and entropy-bits display; copy per item.
- **Verify:** **no `Math.random` anywhere** (code check); 1000-item bulk generation has no duplicates; charset toggles are honored exactly; entropy math correct.

### Phase 32 — Timestamp ↔ date converter
- **Libraries:** `luxon`.
- **Build:** epoch (auto-detect s/ms/µs) ↔ ISO 8601 ↔ human-readable; timezone selector with search; "now" button; relative time display; batch conversion.
- **Verify:** DST transition instants convert correctly; s vs ms auto-detection with override; leap-year and end-of-month edges; timezone list includes user's local zone as default.

### Phase 33 — removed (cron expression parser, dropped from scope)

### Phase 34 — String escape / unescape
- **Libraries:** `he` (HTML entities).
- **Build:** modes: JSON string, HTML entities, URL, shell single/double quote, regex-literal escaping; both directions; chained view (raw ↔ escaped side by side).
- **Verify:** every mode round-trips; HTML named + numeric entities both decode; nested escaping (JSON inside JSON) handled by running twice, not corrupted in one pass.

### Phase 35 — removed (dummy data generator, dropped from scope)

## Group H — Security & inspection tools

### Phase 36 — Text hasher + HMAC generator
- **Libraries:** `hash-wasm` (reuses Phase 9 worker plumbing).
- **Build:** hash text input with SHA-256/512, SHA-1, MD5, SHA-3, BLAKE3; HMAC mode with key input (text or hex); output hex/base64; compare-against-expected field.
- **Verify:** outputs match published RFC test vectors exactly; UTF-8 input encoding is explicit and correct; HMAC with hex vs text key produces documented, correct results.

### Phase 37 — JWT decoder
- **Libraries:** none for decode (base64url + `JSON.parse`); Web Crypto for verification.
- **Build:** paste token → decoded header/payload with pretty JSON, `exp`/`iat`/`nbf` shown as human dates with expired-highlight; optional signature verification (HS256 secret or RS/ES public key paste); **prominent "nothing leaves this device" note**.
- **Verify:** valid/expired/not-yet-valid tokens flagged correctly; tampered payload fails verification; malformed token → clean error; network log empty while decoding.

### Phase 38 — X.509 certificate / CSR decoder
- **Libraries:** `@peculiar/x509` (or `pkijs`).
- **Build:** paste PEM (or drop DER/PEM file) → human-readable fields: subject/issuer, validity with expiry highlight, SANs, key type/size, key usages, fingerprints (SHA-1/256); supports cert chains and CSRs.
- **Verify:** certificate with many SANs; expired cert highlighted; CSR parsed; DER binary upload; fingerprints match `openssl x509 -fingerprint` output.

### Phase 39 — Hex viewer / file type identifier
- **Libraries:** `file-type` (magic bytes), custom virtualized hex dump.
- **Build:** drop any file → detected type from magic bytes (vs extension mismatch warning), hex + ASCII dump with offset navigation and byte search; copy selection as hex.
- **Verify:** common formats identified (zip, pdf, png, elf, exe…); renamed-extension file flagged; 2 GB file views instantly (windowed reads via `File.slice`, never full load); search finds byte sequences across window boundaries.

### Phase 40 — Password strength checker
- **Libraries:** `@zxcvbn-ts/core` (lazy).
- **Build:** live strength meter with crack-time estimates and concrete feedback; **input never persisted, never sent** — masked field with reveal toggle.
- **Verify:** known-weak patterns (dates, keyboard walks, common words) scored low; no IndexedDB/localStorage writes; network log empty; paste + clear leaves no trace.

### Phase 41 — QR code generator + reader
- **Libraries:** `qrcode` (generate), `zxing-wasm` or `jsQR` (read); `getUserMedia` for camera.
- **Build:** generate: text/URL/Wi-Fi credentials → QR with size + error-correction options, download PNG/SVG. Read: from dropped image or live camera.
- **Verify:** generated code scans on a real phone; reader decodes rotated/skewed photos of codes; camera permission denied → graceful fallback to image mode; Wi-Fi QR format correct.

## Group I — Image extensions

### Phase 42 — Image format converter
- **Libraries:** `@jsquash/*` (Squoosh codecs: mozjpeg, oxipng, webp, avif — lazy, WASM).
- **Build:** convert between PNG/JPEG/WebP/AVIF with per-format quality options; batch mode with zip; before/after size comparison.
- **Verify:** alpha channel preserved (or explicit flatten option) when converting transparent PNG→JPEG; AVIF encode of a large photo completes in a worker; batch output zip correct.

### Phase 43 — Image compressor
- **Libraries:** `@jsquash/*` (shared with Phase 42).
- **Build:** quality-targeted compression with a before/after comparison slider; optional max-dimension resize; batch + zip; total savings summary.
- **Verify:** visible-artifact check at chosen quality via comparison slider; metadata stripped (and stated); 20-photo batch from a phone processes without freezing.

### Phase 44 — Image crop / rotate / flip
- **Libraries:** `cropperjs` (or `react-image-crop`) + canvas.
- **Build:** interactive crop with aspect presets (free, 1:1, 16:9, 4:3, passport sizes), pixel-exact input fields, rotate 90° steps + fine angle, flip H/V; export PNG/JPEG.
- **Verify:** crop output dimensions exactly match the pixel fields; EXIF-rotated input displays upright before cropping; fine-angle rotation doesn't accumulate quality loss on repeated ops (single re-render).

### Phase 45 — EXIF viewer & stripper
- **Libraries:** `exifr` (read), `piexifjs` (lossless JPEG strip).
- **Build:** drop image → all metadata grouped (camera, GPS with map-link warning, timestamps); one-click "strip all" download; selective strip (keep orientation, remove GPS).
- **Verify:** GPS coordinates shown then absent after strip (verify with `exiftool` locally); JPEG strip is lossless (pixel data byte-identical); PNG/WebP metadata also handled; orientation preserved when requested.

### Phase 46 — SVG optimizer
- **Libraries:** `svgo` (browser build).
- **Build:** paste or drop SVG → optimized output with size delta; toggleable plugin options (keep viewBox, keep IDs, precision); side-by-side visual render of before/after.
- **Verify:** before/after render pixel-identical at default settings; size reduction on a real-world export (Figma/Illustrator SVG); malformed SVG → clear error, not blank output.

### Phase 47 — Favicon generator
- **Libraries:** canvas + `pica` (reuse Phase 7), ICO encoder (small custom writer).
- **Build:** one square image → full favicon set (16/32/48 ico, 180 apple-touch, 192/512 PNG), generated `site.webmanifest` + HTML snippet; zip download.
- **Verify:** `.ico` contains all sizes and opens in image viewers; PNGs are exact dimensions; manifest JSON valid; snippet paths match zip layout.

### Phase 48 — Color palette extractor
- **Libraries:** small k-means/median-cut in a worker (no heavy dep).
- **Build:** drop image → dominant palette (adjustable count), click-to-copy in hex/RGB/HSL; eyedropper to pick any pixel; contrast-pair suggestions.
- **Verify:** deterministic results for the same image; palette visually representative on photos and flat-color logos; eyedropper returns exact pixel value; copied formats parse in CSS.

## Group J — File extensions

### Phase 49 — Zip / unzip
- **Libraries:** `fflate` (reuses Phase 10 plumbing); `zip.js` only if password support is added later.
- **Build:** create: multi-file/folder dropzone → compressed zip with level option. Extract: drop a zip → entry tree with sizes, extract all or selected files.
- **Verify:** nested folder structure preserved both directions; unicode filenames survive; 4 GB archive streams without full-memory load; password-protected zip → clear "not supported" message; round-trip byte-identical.

### Phase 50 — Duplicate file finder
- **Libraries:** `hash-wasm` worker (reuses Phase 9).
- **Build:** drop a set of files → group by size first, then content hash; duplicate groups with names/sizes; export report CSV. (Read-only: reports, never deletes.)
- **Verify:** identical content under different names grouped; same size + different content NOT grouped (full hash, no false positives); 1000-file batch with progress; zero-byte files handled.

### Phase 51 — OCR (image / scanned PDF → text)
- **Libraries:** `tesseract.js` (lazy; language packs self-hosted under `public/ocr/`).
- **Build:** drop image or scanned PDF (pages via Phase 13's pdf.js render) → extracted text with per-page progress; language selection (English + Chinese traditional/simplified at minimum); copy/download text; feeds the Phase 13 "scanned PDF" gap.
- **Verify:** clean 300-DPI scan reaches usable accuracy; language switching works; language packs load from our origin only; multi-page PDF OCR shows per-page progress and stays responsive; garbage image → low-confidence warning, not silent garbage text.

---

## Phase 53 — Polish & PWA (site-wide final pass)

- `vite-plugin-pwa`: offline support for all client-side tools; cache strategy for the background-removal model.
- Site-wide search/filter on the dashboard; keyboard shortcuts; favicon + meta/OG tags.
- Cross-browser pass: Chromium, Firefox, WebKit (Playwright projects).
- **Site-wide second-pass visual verification:** every tool page re-screenshotted at both viewports and themes against the phase-era screenshots; regressions fixed.
- Lighthouse pass: performance + accessibility ≥ 90 on the dashboard and two heaviest tools.

---

## Backlog (unscheduled ideas)

Add future tool ideas here; promote to a numbered extension phase when scheduled. Currently empty — all previously suggested tools are scheduled as Phases 16–52.
