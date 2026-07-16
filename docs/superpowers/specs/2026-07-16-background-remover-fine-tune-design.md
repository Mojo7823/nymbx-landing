# Background remover — fine-tune brush (stage 1: manual mask editing)

**Date:** 2026-07-16
**Status:** Approved design, pending implementation plan
**Scope:** Phase 8 follow-up. Stage 2 (SAM-guided refinement) is explicitly out of scope and will get its own spec.

## Problem

The background remover (`src/tools/background-remover/`) produces a single automatic result. When the AI mask is wrong (removed part of the subject, kept part of the background), the user has no recourse. The underlying model (`@imgly/background-removal`, ISNet) accepts no guidance input, so correction must happen on the mask, not in the model.

## Solution overview

Add a **Fine-tune** mode entered from the result view. The user paints corrections with two brushes:

- **Keep** (translucent green) — forces painted pixels fully opaque.
- **Remove** (translucent red) — forces painted pixels fully transparent.

A **live preview** recomposites at display resolution after every stroke, undo, redo, or clear. The **Apply** button bakes the corrections at full image resolution, replaces the downloadable result, and returns to the result view. **Cancel** discards all strokes and returns.

Everything runs client-side on canvas. No new dependencies. No network activity.

## UX

### Entry

In the `done` phase, a **Fine-tune** button appears alongside Download / Another image. It switches the tool into a new `tune` phase that replaces the side-by-side compare.

### Edit view

A single canvas, sized to the viewport (long edge capped at the displayed size), showing bottom-to-top:

1. Checkerboard (transparency indicator, same style as the result view).
2. The **original image at ~25% opacity** — so regions the AI removed remain visible enough to paint Keep over them.
3. The current composite (original RGB × corrected alpha) at preview resolution — this is the live preview.
4. Stroke overlay: the stroke being drawn renders at full tint (green `rgba(34,197,94,0.5)` / red `rgba(239,68,68,0.5)`); completed strokes remain at a subtler tint (~0.2 alpha) so the user can see where they have painted without hiding the preview.

The cursor is a circle outline matching the current brush size. Painting works with mouse and touch/pen (Pointer Events).

### Toolbar

Keep / Remove toggle · brush size slider (range scales with image size) · **Undo** · **Redo** · **Clear strokes** · **Apply** · **Cancel**.

Keyboard: `Ctrl+Z` undo, `Ctrl+Shift+Z` / `Ctrl+Y` redo. Undo/Redo/Clear disable when there is nothing to undo/redo/clear.

### Live preview vs. Apply

- **Live preview** (stroke end, undo, redo, clear): recomposite at preview resolution only. Cheap — runs in a few ms even on large images.
- **Apply**: renders strokes to a full-resolution mask, merges with the AI alpha, composites a full-resolution PNG blob, swaps it in as the result (Download uses it), and returns to the result view. Un-applied strokes never affect the downloaded file.
- **Cancel**: returns to the result view without touching the result. If strokes exist, a confirm step prevents accidental loss.

Re-entering Fine-tune after an Apply starts from the applied result with an empty stroke history (the applied alpha becomes the new base mask).

## Data model

```ts
type BrushMode = 'keep' | 'remove'

interface Stroke {
  mode: BrushMode
  size: number        // brush diameter in image pixels
  points: { x: number; y: number }[]  // image-coordinate space
}
```

- Strokes are stored as **vectors in full-image coordinates**, never as pixels. Display-space input is mapped through the canvas scale factor.
- **Undo/redo** is a pointer into the stroke array: undo decrements, redo increments, a new stroke truncates anything past the pointer. Deterministic re-render from `strokes[0..pointer]` guarantees exactness at any resolution.

## Compositing pipeline (pure functions in `mask.ts`)

1. **Base alpha**: decoded once on entering tune mode, from the alpha channel of the current result blob (the AI's mask — including its soft hair/fur edges — is exactly the result PNG's alpha).
2. **`renderStrokes(strokes, width, height, scale)`** → offscreen canvas: strokes drawn as round-cap, round-join paths with a slight blur/feather (~1–2 px at full res) so corrections don't look jagged. Keep and remove render to the same correction layer with distinguishable values (e.g. green→255, red→0 on separate channels or two passes).
3. **`mergeAlpha(baseAlpha, corrections)`** → final alpha: painted-keep → 255, painted-remove → 0, feathered stroke edges blend proportionally, untouched pixels keep the AI's alpha unchanged.
4. **`composite(originalRGB, alpha)`** → output canvas → PNG blob (full res) or preview canvas (display res).

Preview and Apply share the same functions at different scales.

## Component layout

- `src/tools/background-remover/FineTuneEditor.tsx` — canvas, pointer handling, toolbar, undo/redo state. Props: original image bitmap, current result blob, `onApply(newBlob)`, `onCancel()`.
- `src/tools/background-remover/mask.ts` — the pure pipeline above (stroke rendering, alpha merge, composite). Unit-testable without a DOM canvas where possible (alpha merge operates on `Uint8ClampedArray`).
- `BackgroundRemover.tsx` — adds `tune` to the `Phase` union; `done` view gains the Fine-tune button; on `onApply` revokes the old result URL and swaps in the new blob.

## Error handling

- Full-resolution Apply on very large images can exhaust memory; it reuses the tool's existing failure message pattern. On failure the editor stays open and strokes are preserved so the user can Cancel or retry.
- `createImageBitmap`/canvas allocation failures on entry to tune mode surface the same friendly error and return to the result view.

## Testing & verification

- **Vitest** (`mask.test.ts`): alpha merge truth table (keep forces 255, remove forces 0, untouched preserved, feather blends monotonically); undo/redo pointer semantics; display↔image coordinate mapping.
- **Manual + Playwright (T3/T4 per PLAN.md)**: paint keep over a removed region and remove over a kept region on a portrait photo; verify Apply output at full resolution; undo/redo via buttons and keyboard; clear; cancel-with-confirm; screenshots at 1280 px and 390 px, light and dark.
- **Privacy check**: browser network log shows zero requests while fine-tuning.
- **Gates**: `npm run lint`, `npm run typecheck`, `npm run test` all pass before the phase is marked done.

## Out of scope (stage 2, separate spec)

SAM-guided refinement (Transformers.js + SlimSAM, self-hosted): brush strokes sampled into positive/negative point prompts, decoder-only re-runs against a cached image embedding, merged into the base mask. Deferred by explicit user decision on 2026-07-16.
