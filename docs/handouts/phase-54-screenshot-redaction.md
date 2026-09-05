# Phase 54 Handout — Screenshot redaction

**Audience:** the agent implementing Phase 54 (T1) and the agents verifying it (T2–T4). Self-contained; read fully before writing code. [/PLAN.md](../../PLAN.md) (Phase 54) and [/CLAUDE.md](../../CLAUDE.md) are authoritative if anything here seems ambiguous.

---

## 1. Goal

Add **Screenshot redaction** at `/tools/screenshot-redaction` (`src/tools/screenshot-redaction/`): drop or paste a screenshot, draw rectangles or brush strokes over anything sensitive, choose black-out or pixelate, and export a PNG or JPEG in which the original pixels under every region are **gone** — not hidden by a layer, not blurred, not recoverable. Metadata (EXIF, GPS, XMP) does not survive the export. Everything runs in the browser; nothing is uploaded or persisted.

Registry entry exists (`slug: 'screenshot-redaction'`, `phase: 54`, `status: soon`, icon `EyeOff`). Flip it to `'available'`, add the lazy route in `src/tools/routes.ts`, and insert `'screenshot-redaction'` into the "available" list in `src/lib/registry.test.ts` **in registry order** (after `'color-palette-extractor'`).

## 2. Platform facts (verified 2026-09-05 via MDN on context7 and the existing tools)

No new dependency. Everything is Canvas 2D plus a few Web APIs:

- **Decode:** `createImageBitmap(file, { imageOrientation: 'from-image' })` applies the EXIF orientation, so a phone photo with orientation 6 comes in upright and the export carries no orientation tag (its pixels are already upright). This is exactly what `src/tools/image-resize/resize.worker.ts` and `src/tools/crop-rotate-flip/CropRotateFlip.tsx` do.
- **Pixels:** `ctx.getImageData(x, y, w, h)` / `ctx.putImageData(data, x, y)`; create the working context with `{ willReadFrequently: true }`. Note MDN's warning: `putImageData` of pixels with partial alpha is lossy (premultiplied alpha). Redaction fills are opaque, so this does not affect us, but do not round-trip the *whole* image through `getImageData`/`putImageData` — only the region's bounding box.
- **Compositing:** `globalCompositeOperation = 'destination-in'` keeps the destination only where the source is drawn — used to clip a mosaic to a brush stroke. `drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh)` copies a sub-rectangle.
- **Export:** `canvas.toBlob(cb, 'image/png')` / `toBlob(cb, 'image/jpeg', quality)` (or `OffscreenCanvas.convertToBlob({ type, quality })`). A canvas re-encode writes a fresh file with **no EXIF/XMP/ICC** — the metadata stripping comes for free and must be stated in the UI. JPEG has no alpha: flatten onto white first (see `flattenForJpeg` in `resize.worker.ts`).
- **Clipboard:** `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])` copies an image (feature-detect `typeof ClipboardItem !== 'undefined'`; PNG is the only format all browsers accept). Reading a **pasted** screenshot: listen for `paste` on `window`, take `event.clipboardData.files[0]` (or the first `items[i].kind === 'file'` with an image type).
- **Reuse:** `src/tools/background-remover/mask.ts` already has the stroke model (`Stroke { size, points }` in full-image pixels), `fitScale`, and `FineTuneEditor.tsx` has the pointer-capture / primary-pointer-only brush handling to copy.

## 3. Why the redaction is irreversible — design rules

1. **Black-out** fills the region with an opaque colour (default `#000000`; colour picker offered). Nothing of the original remains.
2. **Pixelate** replaces each `block × block` cell of the region's bounding box with the **mean colour of that cell** in the original, computed in JS over `ImageData` (deterministic and testable). Edge cells that hang off the region are partial cells averaged over the pixels they cover. Minimum block size **8 px**, default **16**, maximum **64**. Show a permanent hint next to the mode switch: *"Pixelation can leak short text at small block sizes — use black-out for text you must hide."*
3. **No blur mode.** Blur is a reversible-ish convolution; it is deliberately not offered (PLAN.md says so).
4. The **preview is the export**: the display shows the very pixels that will be exported (the working canvas), not an overlay. What you see is what leaves.
5. Export re-encodes from the working canvas; the original `File` is never modified, never uploaded, never stored.

## 4. Coordinate model

Regions live in **image pixels** (origin top-left). The working canvas has the image's native size (`canvas.width = bitmap.width`) and is displayed CSS-scaled to the zoom; an `<svg viewBox="0 0 w h">` overlay of the same CSS size draws selection outlines and handles, so they stay crisp and aligned at every zoom and on HiDPI (same pattern as Phase 52's editor). Pointer → image pixels via `svg.getScreenCTM().inverse()`. Zoom levels: Fit (default, never upscales beyond 100 %), 50, 100, 200, 400 %; the canvas container scrolls when larger than the viewport.

## 5. Data model, history and rendering

```ts
export type RedactMode = 'black' | 'pixelate'
export interface RectRegion  { id: string; kind: 'rect';  mode: RedactMode; x: number; y: number; width: number; height: number; color: string; block: number }
export interface BrushRegion { id: string; kind: 'brush'; mode: RedactMode; size: number; points: { x: number; y: number }[]; color: string; block: number }
export type Region = RectRegion | BrushRegion
```

- **History:** promote Phase 52's history helpers into a generic **`src/lib/history.ts`** (`History<T> { past: T[]; present: T; future: T[] }`, `commit`, `amend`, `undo`, `redo`, `canUndo`, `canRedo`, `HISTORY_LIMIT`), make `src/tools/pdf-sign-annotate/objects.ts` re-export/alias them so Phase 52 and its tests are untouched in behaviour, and use the generic module here with `T = Region[]`.
- **Render** (`render.ts`, pure canvas glue): `redraw(work, bitmap, regions)` = `drawImage(bitmap)` then, for each region in order: black → `fillRect` or a stroked path with round caps/joins in the fill colour; pixelate → take the bounding box (for a brush, the stroke's bbox padded by `size/2`), `getImageData`, run `pixelateInPlace(data, block)` (pure, in `pixelate.ts`, unit-tested), `putImageData`; for a **brush pixelate**, draw the mosaic into a temp canvas of the bbox size, then paint the stroke path into it with `destination-in` (round caps/joins) and `drawImage` the result back. Only the affected bounding boxes are read back — never the whole 4K frame.
- The **display canvas is the working canvas** (one element). Re-render on every history change; for a 4K image with a dozen regions this is a single `drawImage` plus region-local work and stays well under a frame budget worth of jank.

## 6. UX specification

Use `ToolLayout` (`title="Screenshot redaction"`, `description="Black out or pixelate anything sensitive before you share a screenshot — the pixels are destroyed, not covered"`, `badge="client-side"`) and `FileDropzone` (`accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"`, single file, `maxSize` 50 MB). Conventions: `src/tools/crop-rotate-flip/CropRotateFlip.tsx` (image tool layout, export naming), `src/tools/background-remover/FineTuneEditor.tsx` (brush pointer handling), `src/tools/pdf-sign-annotate/Editor.tsx` (SVG overlay, handles, selection).

1. **Empty state:** dropzone plus "…or press Ctrl/⌘+V to paste a screenshot". A `paste` listener on `window` (active only while this tool is mounted) loads a pasted image. Note under it: "Stays in your browser. The export is re-encoded, so EXIF, GPS and other metadata are removed."
2. **Toolbar:** tools **Rectangle** (default) and **Brush** (size slider 8–200 px, in image pixels, shown as a cursor circle like the fine-tune editor); mode **Black-out** / **Pixelate** with the colour picker (black-out) or block-size slider (pixelate) and the leak hint; **Undo / Redo / Delete / Clear all**; zoom control; primary **Download** with a format select (PNG default / JPEG + quality 60–100) and a **Copy image** button (PNG; hidden when `ClipboardItem` is unavailable).
3. **Drawing:** Rectangle — press-drag-release creates a region (ignore drags under 3×3 px); the new region is selected. Brush — each stroke is one region. Regions are created with the current mode/colour/block; changing those controls while a region is selected updates that region (a history step).
4. **Selection:** click a region (topmost) to select; dashed outline + four corner handles for rectangles (move/resize, clamp to the image); brush regions show their bbox outline and can be moved but not resized; `Delete`/`Backspace` deletes; `Escape` deselects; `Ctrl/⌘+Z` / `Ctrl/⌘+Shift+Z`.
5. **Region list** (right of the canvas on ≥ 1024 px, below it on mobile): one row per region — icon (rect/brush), mode, size (`420 × 38 px`), a mode toggle, and a delete button; clicking a row selects it. Count in the header (`3 regions`).
6. **Export:** `Download` → `<stem>.redacted.png` / `.jpg` via `downloadBlob`; a toast confirms and repeats the metadata-removed note. While a 4K export encodes, the button shows `Preparing…`. **Copy image** → toast "Copied to clipboard" or a clear error if the browser refuses.
7. **Other image:** a "Replace image" control returns to the dropzone (regions are discarded — confirm only if there are regions).
8. **Errors:** unsupported/undecodable file → toast "Could not read that image"; nothing hangs.
9. **Never** write the image, regions or anything derived to IndexedDB/localStorage. Persist only the tool preferences (mode, colour, block size, brush size, export format) via `src/lib/settings.ts`.

## 7. Code layout

```
src/lib/history.ts (+ .test.ts)                     generic undo/redo, extracted from Phase 52
src/tools/screenshot-redaction/
  ScreenshotRedaction.tsx   page: load/paste, toolbar, canvas + overlay, region list, export
  Editor.tsx                canvas + SVG overlay, pointer handling (rect drag, brush strokes, move/resize)
  regions.ts (+ .test.ts)   Region types, factories, normalizeRect, clampRect, move/resize, hit-test, bbox, label/size formatting
  pixelate.ts (+ .test.ts)  pixelateInPlace(data: Uint8ClampedArray, width, height, block) on raw RGBA — pure, no canvas
  render.ts                 redraw(), brush path helpers, mosaic compositing, export (toBlob, JPEG flatten), output name
  loadImage.ts              File/Blob → ImageBitmap via createImageBitmap(from-image), paste-event helper
```

Strict TS, no `any`. Canvas glue is not unit-tested (jsdom has no canvas); the pixel math and geometry are. Confirm with `npm run build` that the dashboard entry chunk is unchanged.

## 8. Tasks (T1 — in order; `npm run lint` and `npm run typecheck` after each step; `npm run test` at the end)

1. `src/lib/history.ts` extracted from Phase 52 with tests; Phase 52 rewired; its tests green.
2. `regions.ts`, `pixelate.ts` with tests (block means correct incl. partial edge cells; every cell uniform; deterministic; alpha channel averaged too; `block` clamped to ≥ 8).
3. `loadImage.ts`, `render.ts`.
4. `Editor.tsx`, `ScreenshotRedaction.tsx` per §6; route, registry status, registry test.
5. `npm run build`; entry chunk unchanged.
6. Browser smoke test (Python Playwright, `vite preview` **from the repo root** on 127.0.0.1:4173): drop `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/redact-assets/chat-1600.png`, drag a rectangle over the card-number line (image y ≈ 290–330, x ≈ 220–1000 — compute client coordinates from the overlay's bounding box and viewBox), switch it to pixelate 16, download, and verify with Pillow that (a) inside the rectangle every 16×16 cell is uniform and equals the mean of the original cell (±1), (b) outside the rectangle the PNG is byte-identical to the original, (c) `Image.open(out).getexif()` is empty. Print every request URL (same-origin GETs only). Stop the preview with `kill <pid>` of the node process, never `pkill -f`.

Do not commit. Report: files, gate numbers, entry chunk before/after, smoke-test evidence, decisions the handout did not cover, anything unfinished.

## 9. Verification (T2/T3, by the verifier)

Assets in `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/redact-assets/`: `chat-1600.png` (1600×700 support-chat screenshot with an email, phone, card number, address, IP), `chat-4k.png` (3840×2160, same layout scaled), `panel-alpha.png` (1200×600 RGBA with transparent background and a token string), `photo-exif.jpg` (1200×800 stored sideways with EXIF orientation 6, GPS 25°02′N 121°33′E, Make/Model).

Checks (Pillow for pixel work):
1. **Black-out is total:** rectangle over the card-number line, export PNG → every pixel inside is exactly the fill colour; every pixel outside equals the original (`ImageChops.difference` bbox is inside the rectangle only).
2. **Pixelate is a true mosaic:** same rectangle, pixelate 16 → each 16×16 cell inside is uniform and equals the mean of the original cell (±1); the region's per-pixel mean absolute error vs the original exceeds a sensible floor (report it); scaling the pixelated crop back up does not reproduce the original (report PSNR or MAE). Repeat with block 8 and 64 and confirm the cell sizes.
3. **Brush:** black brush stroke over the email → pixels along the stroke are the fill colour; pixels outside the stroke's outline unchanged. Brush + pixelate → mosaic only under the stroke (compare a pixel just outside the stroke with the original).
4. **Metadata gone:** `photo-exif.jpg` → export as JPEG and as PNG: `getexif()` empty, no GPS IFD, no `exif`/`xmp`/`comment` in `Image.info`, PNG without text/eXIf chunks; image is **upright** (export size 800×1200). Chromium's JPEG encoder adds its own generic sRGB ICC profile (~456 bytes, "Google Inc. 2016") — that is encoder-added, not user metadata, and is acceptable; what must be absent is anything from the source file.
5. **Alpha:** `panel-alpha.png` → PNG export keeps transparency (corner pixel alpha 0) with the token blacked out; JPEG export is flattened on white.
6. **Alignment vs zoom and HiDPI:** with `device_scale_factor=2` and again at zoom 50 % and 200 %, draw a rectangle at the same intended image coordinates → the exported black bbox matches within 1 px each time.
7. **4K:** `chat-4k.png` loads and renders in < 2 s; drawing a rectangle updates the preview within one frame or two (measure with a `PerformanceObserver` long-task check: no long task > 200 ms during a drag); pixelating a full-image region completes (report time); export completes (report time); JS heap stays reasonable.
8. **Undo/redo and list:** add 3 regions, delete the middle one from the list, undo, redo; region count and preview follow; `Clear all` then undo restores.
9. **Paste:** dispatch a synthetic `ClipboardEvent('paste', { clipboardData })` whose `DataTransfer` holds `chat-1600.png` → the image loads.
10. **Copy image:** grant `clipboard-read`/`clipboard-write` in the Playwright context; after Copy, `navigator.clipboard.read()` yields a `image/png` item whose pixels match the export (or report if headless refuses).
11. **Privacy/persistence:** all requests same-origin GETs, none with a body; IndexedDB `settings` holds preferences only, no image data; localStorage untouched.
12. **Console/pageerror:** none. **Gates:** report numbers.

Visual (T3): 1280 and 390, light and dark: empty state; image loaded with one selected rectangle (handles) and the region list; brush mode with the cursor circle; pixelate hint visible; export format select open; error toast. `scrollWidth <= viewport`; the canvas fits at 390 (Fit zoom) and the region list stacks below.

## 10. Definition of done

Gates green; every §9 check passes on a fresh production build (T4); PLAN.md Phase 54 needs no change unless a decision diverged — if so, update it in the same commit and say which.
