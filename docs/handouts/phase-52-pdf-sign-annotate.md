# Phase 52 Handout — PDF sign & annotate

**Audience:** the agent implementing Phase 52 (T1) and the agents verifying it (T2–T4). Self-contained; read fully before writing code. [/PLAN.md](../../PLAN.md) (Phase 52, narrowed on 2026-09-05) and [/CLAUDE.md](../../CLAUDE.md) are authoritative if anything here seems ambiguous.

---

## 1. Goal and scope

Add **PDF sign & annotate** at `/tools/pdf-sign-annotate` (`src/tools/pdf-sign-annotate/`): drop a PDF, place a signature (drawn or an image), text, a date stamp or checkmarks on any page, then download a copy with everything **flattened into the page content**. Entirely in the browser; the original file is never modified.

The scope is deliberately narrow (the roadmap review cut it from a general PDF editor):

- Objects: **text box**, **image stamp** (PNG/JPEG; WebP converted to PNG on import), **freehand ink** (drawn signature or mark), **checkmark preset**, **date-stamp preset** (a text object pre-filled with today's date, format selectable `2026-09-05` / `5 Sep 2026` / `05/09/2026`).
- Operations: select, move, resize (corner handles; ink and images keep aspect ratio; text resizes font size), delete (button and `Delete`/`Backspace`), undo/redo (buttons and `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`), duplicate to another page is **not** required.
- Export: one mode only — flatten. State it plainly in the UI: "Objects are flattened into the page and can't be edited in other PDF viewers."
- **Not in scope** (backlog): shapes/arrows, real PDF annotation objects, form filling, multiple files.

Registry entry exists (`slug: 'pdf-sign-annotate'`, `phase: 52`, `status: soon`, icon `PenTool`). Flip it to `'available'`, add the lazy route in `src/tools/routes.ts`, and insert `'pdf-sign-annotate'` into the "available" list in `src/lib/registry.test.ts` **in registry order** (after `'xlsx-csv-viewer'`).

## 2. Library facts (verified 2026-09-05 via context7 and the installed packages)

**pdf-lib 1.17.1** (already installed) with **fontkit 2** through `src/lib/pdfFont.ts` (`embedSubsetFont`). `@pdf-lib/fontkit` was dropped on 2026-09-05: its Noto Sans TC subsets lose about half of the glyphs; see the note in PLAN.md Phase 18.

- `doc.registerFontkit(fontkit)`, `await doc.embedFont(bytes, { subset: true })` → `font.widthOfTextAtSize(text, size)`, `font.heightAtSize(size)`.
- `page.drawText(text, { x, y, size, font, color, lineHeight, rotate })` — `(x, y)` is the **baseline start of the first line** in PDF user space (origin bottom-left, y up). `\n` breaks lines by `lineHeight`.
- `page.drawImage(img, { x, y, width, height, rotate, opacity })` — `(x, y)` is the **bottom-left** of the image box. `doc.embedPng` / `doc.embedJpg`.
- `page.drawSvgPath(d, { x, y, scale, color, borderColor, borderWidth, borderLineCap, rotate })` — the SVG path's **own coordinates are y-down** and are drawn with their origin at `(x, y)`; pdf-lib flips the y-axis for you. So an SVG path expressed relative to its top-left in "viewed points" is placed with `x = left`, `y = pageHeight − top`, `scale = 1` when the path is already in points. `color` fills, `borderColor`/`borderWidth` stroke. `LineCapStyle.Round` is exported.
- Rotated pages: `page.getRotation().angle` (normalize with `normalizeRotate`), `page.getSize()` is the **unrotated** media box. Everything drawn is in unrotated user space, so viewed-space coordinates must be mapped back (see §4).

**perfect-freehand 1.2.3** (add as a dependency; ~110 kB unpacked, pure TS, no deps):

- `getStroke(points, { size, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: true, last: true })` → outline polygon `[x, y][]`. Points are `[x, y, pressure?]`.
- Render the polygon with the README's `getSvgPathFromStroke(points)` helper (copy it into `src/tools/pdf-sign-annotate/ink.ts` with a unit test) → an SVG path string that is **filled** (not stroked): use `<path d fill=color>` in the preview and `drawSvgPath(d, { color, borderWidth: 0 })` in the export. Same function, same points → identical geometry on both sides.

**pdf.js (pdfjs-dist, installed)** for page rendering — copy the setup from `src/tools/pdf-page-organizer/PdfPageOrganizer.tsx` (lazy thumbnail rendering with `devicePixelRatio`, `getViewport({ scale, rotation })` including the page's own `rotate`) and the `PasswordException` handling / wording from `src/tools/pdf-to-image-markdown/PdfToImageMarkdown.tsx`.

## 3. Fonts — one font on both sides, so preview equals export

Do **not** use Helvetica for export while previewing in a web font; the metrics differ and text would shift. Use **Noto Sans TC** for all text objects on both sides: it is already self-hosted at `/fonts/NotoSansTC-Regular.ttf` (copied by `scripts/copy-model-assets.mjs`, fetched by Phase 18 the same way — see `PdfWatermark.tsx` around `fontRef`), covers Latin and CJK, and pdf-lib subsets it on embed so file growth is small. In the editor declare `@font-face { font-family: 'NYMBX Sign'; src: url('/fonts/NotoSansTC-Regular.ttf'); font-display: block }` once (in the tool's CSS module or a `<style>` injected by the tool page) and render preview text with that family; wait for `document.fonts.load('16px "NYMBX Sign"')` before the first render so nothing reflows.

## 4. Coordinate model — the part that decides "pixel-correct"

Store every object in **viewed points**: the page as the viewer shows it (honouring `/Rotate`), origin **top-left**, y **down**, units = PDF points (1/72 in). This is zoom-independent: the editor's overlay is an `<svg viewBox="0 0 vw vh">` sized to the rendered page in CSS pixels, so the browser does the scaling and objects never need re-computing when zoom changes.

- `vw, vh` = `viewedSize(w, h, rotate)` from `src/tools/pdf-watermark/placement.ts`. Move `normalizeRotate`, `viewedSize`, `viewedToUser` into **`src/lib/pdfGeometry.ts`** and re-export them from `placement.ts` so the watermark tool and its tests stay untouched.
- **Careful:** `viewedToUser(vx, vy, w, h, rotate)` expects viewed space with **y up** (PDF convention). Convert first: `vyUp = vh − vyDown`. Add `viewedTopLeftToUser` (or similar) in `pdfGeometry.ts` that takes the top-left/y-down box `{ x, y, width, height }` and returns the pdf-lib draw origin plus `drawAngle = rotate` for the object types below; unit-test it for all four rotations against hand-computed expectations.
- Pointer → viewed points: `const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; pt.matrixTransform(svg.getScreenCTM().inverse())`. Never compute with `getBoundingClientRect` ratios by hand.
- Export per object (unrotated page, `rotate === 0`; for other rotations go through the geometry helper and pass `rotate: degrees(drawAngle)`):
  - text: `drawText(text, { x, y: h − baselineY, size, font, lineHeight: size × 1.25, color })` where the object stores the **first-line baseline** `baselineY` (that is also what the SVG `<text y>` uses, so both agree).
  - image: `drawImage(img, { x, y: h − (top + height), width, height })`.
  - ink: outline path computed from the stored points (already in viewed points, relative to the object's top-left) → `drawSvgPath(d, { x: left, y: h − top, color, borderWidth: 0 })`. Resizing an ink object scales its points (store a `scale` or rescale the points; either way export uses the same numbers as the preview).
  - checkmark: a fixed path `M 3 12 L 9.5 18.5 L 21 5` in a 24-unit box, stroked: `drawSvgPath(d, { x: left, y: h − top, scale: size / 24, borderColor: color, borderWidth: 2.5 × (size / 24), borderLineCap: LineCapStyle.Round })`.
- Verification hook: `exportPlan(objects, pageInfo)` — a **pure** function that returns the list of draw calls (type, x, y, width/height/size, rotate, path) — so tests can assert coordinates for all four rotations without pdf-lib. The worker then just executes that plan.

## 5. UX specification

Use `ToolLayout` (`title="PDF sign & annotate"`, `description="Place a signature, text, dates and checkmarks on a PDF — flattened into a copy, in your browser"`, `badge="client-side"`) and `FileDropzone` (`accept="application/pdf"`, single file). Look at `src/tools/pdf-watermark/PdfWatermark.tsx` (controls layout, worker use, font fetch, download) and `src/tools/background-remover/FineTuneEditor.tsx` (pointer capture, `touch-none`, primary-pointer-only strokes) for conventions.

1. **Empty state:** dropzone plus a one-line note: "The file stays in your browser; you download a flattened copy. The original is never changed."
2. **Editor layout** (after a drop): a **toolbar** row, a **page canvas** (single page at a time, fit-to-width with a zoom control 50–200 % and "Fit"), a **page navigator** (Prev / `n of N` input / Next, plus a lazily rendered thumbnail strip on ≥ 1024 px; thumbnails render only when scrolled into view), and a **properties panel** for the selected object (text: content, font size, color; image: opacity is **not** required; ink: color, thickness; checkmark: color, size; date: format). On 390 px the properties panel collapses under the canvas and the thumbnail strip is hidden.
3. **Toolbar tools:** Select (default), Text, Image (file picker, PNG/JPEG/WebP), Draw (ink on the page), Signature (opens a signature pad), Checkmark, Date. Plus Undo, Redo, Delete (enabled when something is selected), and a primary **Download signed PDF** button.
4. **Signature pad:** a modal with a white pad (perfect-freehand, black ink, thickness slider), Clear, Cancel, **Place**. Placing puts an ink object of a sensible default width (~30 % of the viewed page width) at the centre of the current page, selected and ready to drag. "Reuse last signature" keeps the last drawn strokes in component state only — **never** persisted to IndexedDB or localStorage (a signature is personal data); say so in the modal.
5. **Drawing directly on the page** (Draw tool): each pen-up creates one ink object; strokes made within 600 ms of each other merge into the same object so a multi-stroke signature is one movable thing.
6. **Selection:** click to select; a dashed outline with four corner handles; drag to move; corner-drag to resize; `Escape` deselects; objects are clamped to the page. Text objects edit inline on double-click (a `contenteditable`-free approach is fine: an absolutely positioned `<textarea>` over the box while editing).
7. **Undo/redo:** immutable history of the objects array (cap 100). Undo/redo work across page switches (the history is document-wide).
8. **Export:** button → `Preparing…` state → download `<name>.signed.pdf` (via `downloadBlob`). A toast confirms. Export runs in a Comlink worker (`sign.worker.ts`), like `watermark.worker.ts`: it receives the original bytes, the export plan, image bytes and the font bytes, returns the new bytes. The original `File` is never mutated.
9. **Errors:** encrypted PDF → the Phase 13 wording ("This PDF is password-protected. Remove the password first; encrypted files are not supported."); unreadable → clear error; export failure → toast with the message, editor state preserved. Image over 20 MB → toast and ignore.
10. **Performance:** only the current page is rendered at full resolution; thumbnails are lazy; a 100-page PDF must open in well under 2 s and page switches must feel instant (render on demand, keep at most 3 rendered pages cached). Never render every page up front.
11. **Privacy:** no network requests while a file is loaded except the one-time same-origin font fetch. State in the UI footer of the tool: "Nothing is uploaded."

## 6. Code layout

```
src/tools/pdf-sign-annotate/
  PdfSignAnnotate.tsx     page component: state (doc, pageIndex, objects, history, selection, tool), layout
  Editor.tsx              page canvas + SVG overlay + pointer handling + handles (no pdf-lib here)
  SignaturePad.tsx        modal pad
  Thumbnails.tsx          lazy thumbnail strip (reuse the organizer's approach)
  objects.ts              object types, factories, hit-testing, move/resize math, history helpers  (+ objects.test.ts)
  ink.ts                  perfect-freehand wrapper + getSvgPathFromStroke + point scaling             (+ ink.test.ts)
  exportPlan.ts           pure objects → draw-call plan incl. rotation mapping                        (+ exportPlan.test.ts)
  sign.worker.ts          Comlink worker: executes the plan with pdf-lib (fontkit registered)
  pdfDoc.ts               pdf.js loading (PasswordException), page info (size, rotate → vw/vh), page render
src/lib/pdfGeometry.ts    normalizeRotate / viewedSize / viewedToUser moved here (+ pdfGeometry.test.ts); placement.ts re-exports
```

Strict TS, no `any`. Heavy imports (`pdfjs-dist`, `pdf-lib`, `perfect-freehand`, `@pdf-lib/fontkit`) only inside this tool's files/worker — confirm with `npm run build` that the dashboard entry chunk is unchanged.

## 7. Tasks (T1 — in order; `npm run lint` and `npm run typecheck` after each step; `npm run test` at the end)

1. `npm i perfect-freehand@^1.2.3`.
2. `src/lib/pdfGeometry.ts` + tests; `placement.ts` re-exports; watermark tests still green.
3. `objects.ts`, `ink.ts`, `exportPlan.ts` with tests — write these **before** the UI; they carry the correctness.
4. `pdfDoc.ts`, `Editor.tsx`, `SignaturePad.tsx`, `Thumbnails.tsx`, `PdfSignAnnotate.tsx`.
5. `sign.worker.ts`; wire export + download.
6. Route, registry status, registry test.
7. `npm run build`; compare `dist/assets/index-*.js` size to main (must be unchanged).
8. Browser smoke test (Python Playwright, `vite preview` from the **repo root** on 127.0.0.1:4173): open `/tools/pdf-sign-annotate`, drop `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/sign-assets/mixed-orient.pdf`, add a text object and a checkmark on page 2 (landscape) via mouse events on the overlay, export with `expect_download`, then rasterize the result with `pdftoppm -r 72 -png out.pdf page` and confirm the objects appear where you placed them. Print every request URL seen (must be same-origin GETs only). Stop the preview server with `kill <pid>` of the node process, not `pkill -f`.

Do not commit. Report: files, versions, gate numbers, bundle size before/after, smoke-test result with the pdftoppm evidence, decisions the handout did not cover, anything unfinished.

## 8. Verification (T2/T3, by the verifier)

Assets in `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/sign-assets/`: `mixed-orient.pdf` (portrait A4, landscape A4, Letter; every page has a 100 px ruler grid so positions can be read off), `mixed-orient-rotate.pdf` (same, page 3 carries `/Rotate 90`), `hundred-pages.pdf`, `signature.png` (transparent), `stamp.jpg`, `encrypted.pdf` (password `secret`). `pdftoppm` (poppler) is installed for rasterizing exports; Pillow for pixel checks.

Checks:
1. **Position fidelity:** place a checkmark at a known ruler intersection on each page of `mixed-orient.pdf` at 100 % zoom, export, rasterize at 72 DPI (1 px = 1 pt) and measure the drawn mark's bounding box → within **2 pt** of the intended position on all three pages. Repeat once at 50 % and once at 200 % zoom (the export must not change with zoom).
2. **Rotated page:** same on page 3 of `mixed-orient-rotate.pdf` — the object appears where it was placed as the viewer shows the page.
3. **Signature sharpness:** draw a signature in the pad, place, export; inspect the PDF content stream (`pypdf` → `page.get_contents()`; look for path operators `m`/`c`/`l`/`f`, and **no** image XObject for the signature) and rasterize at 300 DPI to confirm smooth edges.
4. **CJK text:** a text object with `簽名：王小明 2026-09-05` exports readable text (rasterize) and the file embeds a subset font (`/FontFile2` present, file growth < 1 MB).
5. **Undo/redo across pages:** add on page 1, switch to page 2, add, undo twice → both gone; redo twice → both back; page switch preserves per-page objects.
6. **Original untouched:** hash the dropped file bytes before and after export (read the `File` via `input.files` in the page) — identical; the download is a different file.
7. **100-page PDF:** opens and shows page 1 in < 2 s after drop; switching to page 100 completes in < 1 s; memory does not climb linearly (check `performance.memory` if available or simply that the tab stays responsive).
8. **Encrypted PDF** → exact wording error, no hang. Unsupported drop → toast.
9. **Privacy:** every request while a file is loaded is a same-origin GET; the only asset fetch is the Noto font; no request body ever carries PDF bytes.
10. **Output opens:** the exported PDF loads in pdf.js (use the site's own PDF → image tool or a small pdf.js page) and in `pdftoppm` without warnings; page count and sizes unchanged.
11. **Console/pageerror:** none during the above.
12. **Gates:** lint, typecheck, test numbers.

Visual (T3): 1280 and 390, light and dark: empty state; editor with a page loaded and one object selected (handles visible); signature pad open; properties panel with a text object; export in progress; error state. `scrollWidth <= viewport` everywhere; the page canvas must not overflow on 390 px (fit-to-width).

## 9. Definition of done

Lint, typecheck, tests green; every §8 check passes on a fresh production build (T4); PLAN.md Phase 52 text needs no change unless a decision diverged — if so, update it in the same commit and say which.
