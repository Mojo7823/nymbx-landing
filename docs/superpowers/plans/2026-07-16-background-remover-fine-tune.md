# Background Remover Fine-Tune Brush Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fine-tune mode to the background remover: keep/remove brushes with live low-res preview, full-resolution Apply, and undo/redo.

**Architecture:** Brush strokes are stored as vectors in full-image coordinates with an undo cursor. A pure pipeline (`mask.ts`, unit-tested) merges rasterized stroke corrections into the AI result's alpha channel; thin canvas adapters (`render.ts`) rasterize strokes and composite pixels. `FineTuneEditor.tsx` renders a layered canvas (checkerboard → faint original → live preview → stroke overlay) and recomposites the preview at display resolution on every stroke/undo/redo; Apply runs the same pipeline at full resolution and hands the new PNG back to `BackgroundRemover.tsx`.

**Tech Stack:** React 19 + TypeScript strict, Canvas 2D, Vitest (jsdom — **no real canvas**, so all logic that can be pure lives in `mask.ts`), Tailwind, lucide-react icons. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-16-background-remover-fine-tune-design.md`

## Global Constraints

- `npm run lint` and `npm run typecheck` must pass with zero errors before any task is marked complete (CLAUDE.md rule 1).
- No network request may contain user image data; fine-tuning must produce **zero** network requests (CLAUDE.md rule 2).
- No new npm dependencies.
- Tools never touch files on disk; everything operates on in-memory blobs (CLAUDE.md rule 7).
- jsdom has no canvas: unit tests may only exercise pure functions operating on arrays/objects. Canvas adapters and the editor component are verified visually in Tasks 6–7.
- Phase completion requires T3 + T4 visual verification: screenshots at 1280 px and 390 px, light and dark theme (CLAUDE.md rule 5).
- Working directory: `/home/devi/nymbx-landing`. The repo has unrelated staged changes — always `git add`/`git commit` with explicit file paths, never `git add -A` or bare `git commit`.

---

### Task 1: Stroke history and geometry (pure core, part 1)

**Files:**
- Create: `src/tools/background-remover/mask.ts`
- Test: `src/tools/background-remover/mask.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 2–5):
  - `type BrushMode = 'keep' | 'remove'`
  - `interface StrokePoint { x: number; y: number }`
  - `interface Stroke { mode: BrushMode; size: number; points: StrokePoint[] }` (size = brush diameter in full-image pixels; points in full-image coordinates)
  - `interface StrokeHistory { strokes: Stroke[]; cursor: number }`
  - `emptyHistory: StrokeHistory`
  - `pushStroke(h: StrokeHistory, s: Stroke): StrokeHistory`
  - `undo(h: StrokeHistory): StrokeHistory`, `redo(h: StrokeHistory): StrokeHistory`
  - `canUndo(h: StrokeHistory): boolean`, `canRedo(h: StrokeHistory): boolean`
  - `activeStrokes(h: StrokeHistory): Stroke[]`
  - `fitScale(imageWidth: number, imageHeight: number, maxWidth: number, maxHeight: number): number`

- [ ] **Step 1: Write the failing tests**

Create `src/tools/background-remover/mask.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  activeStrokes,
  canRedo,
  canUndo,
  emptyHistory,
  fitScale,
  pushStroke,
  redo,
  undo,
  type Stroke,
} from './mask'

function stroke(n: number): Stroke {
  return { mode: 'keep', size: 10, points: [{ x: n, y: n }] }
}

describe('stroke history', () => {
  it('starts empty with nothing to undo or redo', () => {
    expect(activeStrokes(emptyHistory)).toEqual([])
    expect(canUndo(emptyHistory)).toBe(false)
    expect(canRedo(emptyHistory)).toBe(false)
  })

  it('pushes strokes and undoes/redoes them exactly', () => {
    let h = pushStroke(pushStroke(emptyHistory, stroke(1)), stroke(2))
    expect(activeStrokes(h)).toEqual([stroke(1), stroke(2)])

    h = undo(h)
    expect(activeStrokes(h)).toEqual([stroke(1)])
    expect(canRedo(h)).toBe(true)

    h = redo(h)
    expect(activeStrokes(h)).toEqual([stroke(1), stroke(2)])
    expect(canRedo(h)).toBe(false)
  })

  it('is a no-op to undo at the start or redo at the end', () => {
    expect(undo(emptyHistory)).toEqual(emptyHistory)
    const h = pushStroke(emptyHistory, stroke(1))
    expect(redo(h)).toEqual(h)
  })

  it('truncates the redo branch when a new stroke follows an undo', () => {
    let h = pushStroke(pushStroke(emptyHistory, stroke(1)), stroke(2))
    h = pushStroke(undo(h), stroke(3))
    expect(activeStrokes(h)).toEqual([stroke(1), stroke(3)])
    expect(canRedo(h)).toBe(false)
  })
})

describe('fitScale', () => {
  it('scales a large image down to fit the viewport', () => {
    expect(fitScale(2000, 1000, 1000, 800)).toBe(0.5)
    expect(fitScale(1000, 2000, 1000, 800)).toBe(0.4)
  })

  it('never upscales a small image', () => {
    expect(fitScale(400, 300, 1000, 800)).toBe(1)
  })

  it('falls back to 1 for degenerate dimensions', () => {
    expect(fitScale(0, 0, 1000, 800)).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tools/background-remover/mask.test.ts`
Expected: FAIL — `Cannot find module './mask'` (or missing exports).

- [ ] **Step 3: Write the implementation**

Create `src/tools/background-remover/mask.ts`:

```typescript
export type BrushMode = 'keep' | 'remove'

export interface StrokePoint {
  x: number
  y: number
}

export interface Stroke {
  mode: BrushMode
  /** Brush diameter in full-image pixels. */
  size: number
  /** Path in full-image coordinates. */
  points: StrokePoint[]
}

/**
 * Undo/redo over brush strokes. `cursor` is the number of strokes currently
 * in effect; strokes past the cursor are the redo branch. Strokes are stored
 * as vectors so re-rendering `strokes[0..cursor]` at any resolution is exact.
 */
export interface StrokeHistory {
  strokes: Stroke[]
  cursor: number
}

export const emptyHistory: StrokeHistory = { strokes: [], cursor: 0 }

export function pushStroke(history: StrokeHistory, stroke: Stroke): StrokeHistory {
  return {
    strokes: [...history.strokes.slice(0, history.cursor), stroke],
    cursor: history.cursor + 1,
  }
}

export function undo(history: StrokeHistory): StrokeHistory {
  return history.cursor === 0 ? history : { ...history, cursor: history.cursor - 1 }
}

export function redo(history: StrokeHistory): StrokeHistory {
  return history.cursor === history.strokes.length
    ? history
    : { ...history, cursor: history.cursor + 1 }
}

export function canUndo(history: StrokeHistory): boolean {
  return history.cursor > 0
}

export function canRedo(history: StrokeHistory): boolean {
  return history.cursor < history.strokes.length
}

export function activeStrokes(history: StrokeHistory): Stroke[] {
  return history.strokes.slice(0, history.cursor)
}

/** Scale factor that fits an image inside a viewport without upscaling. */
export function fitScale(
  imageWidth: number,
  imageHeight: number,
  maxWidth: number,
  maxHeight: number,
): number {
  if (imageWidth <= 0 || imageHeight <= 0) return 1
  return Math.min(1, maxWidth / imageWidth, maxHeight / imageHeight)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tools/background-remover/mask.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: zero errors.

```bash
git add src/tools/background-remover/mask.ts src/tools/background-remover/mask.test.ts
git commit -m "feat(background-remover): stroke history and viewport-fit helpers for fine-tune"
```

---

### Task 2: Alpha merging (pure core, part 2)

**Files:**
- Modify: `src/tools/background-remover/mask.ts` (append)
- Test: `src/tools/background-remover/mask.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Tasks 4–5):
  - `mergeAlpha(base: Uint8ClampedArray, corrections: Uint8ClampedArray): Uint8ClampedArray`
    - `base`: alpha channel only, length = width × height (the AI result's alpha).
    - `corrections`: RGBA pixel data, length = width × height × 4, from rasterized strokes — keep strokes are green (G ≥ R), remove strokes are red (R > G), and the alpha channel is brush coverage (0 = untouched, 255 = fully painted, intermediate at feathered edges).
    - Returns a **new** array; never mutates `base`.

- [ ] **Step 1: Write the failing tests**

Append to `src/tools/background-remover/mask.test.ts` (add `mergeAlpha` to the existing import from `./mask`):

```typescript
describe('mergeAlpha', () => {
  // One-pixel helpers: base alpha value + one RGBA correction pixel.
  function merge(base: number, [r, g, b, a]: [number, number, number, number]): number {
    const out = mergeAlpha(new Uint8ClampedArray([base]), new Uint8ClampedArray([r, g, b, a]))
    return out[0]
  }

  it('forces fully-painted keep pixels opaque', () => {
    expect(merge(0, [0, 255, 0, 255])).toBe(255)
    expect(merge(128, [0, 255, 0, 255])).toBe(255)
  })

  it('forces fully-painted remove pixels transparent', () => {
    expect(merge(255, [255, 0, 0, 255])).toBe(0)
    expect(merge(128, [255, 0, 0, 255])).toBe(0)
  })

  it('leaves untouched pixels exactly at the AI alpha', () => {
    expect(merge(0, [0, 0, 0, 0])).toBe(0)
    expect(merge(37, [0, 0, 0, 0])).toBe(37)
    expect(merge(255, [0, 0, 0, 0])).toBe(255)
  })

  it('blends proportionally at feathered edges', () => {
    // 50% coverage keep over transparent -> halfway to opaque
    expect(merge(0, [0, 255, 0, 128])).toBe(128)
    // 50% coverage remove over opaque -> halfway to transparent
    expect(merge(255, [255, 0, 0, 128])).toBe(127)
  })

  it('does not mutate the base array and preserves neighbours', () => {
    const base = new Uint8ClampedArray([10, 20, 30])
    const corrections = new Uint8ClampedArray([
      0, 0, 0, 0, // pixel 0 untouched
      0, 255, 0, 255, // pixel 1 keep
      255, 0, 0, 255, // pixel 2 remove
    ])
    const out = mergeAlpha(base, corrections)
    expect(Array.from(out)).toEqual([10, 255, 0])
    expect(Array.from(base)).toEqual([10, 20, 30])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tools/background-remover/mask.test.ts`
Expected: FAIL — `mergeAlpha` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `src/tools/background-remover/mask.ts`:

```typescript
/**
 * Merge brush corrections into a base alpha channel.
 *
 * `base` is alpha-only (length w×h) — the AI result's alpha, including its
 * soft hair/fur edges. `corrections` is RGBA (length w×h×4) from rasterized
 * strokes: keep strokes green, remove strokes red, alpha = brush coverage.
 * Painted-keep pulls alpha toward 255, painted-remove toward 0, feathered
 * edges blend proportionally, untouched pixels keep the AI's alpha.
 */
export function mergeAlpha(
  base: Uint8ClampedArray,
  corrections: Uint8ClampedArray,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(base)
  for (let i = 0; i < base.length; i++) {
    const coverage = corrections[i * 4 + 3]
    if (coverage === 0) continue
    const target = corrections[i * 4 + 1] >= corrections[i * 4] ? 255 : 0
    out[i] = base[i] + ((target - base[i]) * coverage) / 255
  }
  return out
}
```

(`Uint8ClampedArray` assignment clamps and rounds — no manual `Math.round` needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tools/background-remover/mask.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Lint, typecheck, commit**

Run: `npm run lint && npm run typecheck`
Expected: zero errors.

```bash
git add src/tools/background-remover/mask.ts src/tools/background-remover/mask.test.ts
git commit -m "feat(background-remover): pure alpha-merge for brush corrections"
```

---

### Task 3: Canvas adapters and shared checkerboard

**Files:**
- Create: `src/tools/background-remover/render.ts`
- Create: `src/tools/background-remover/checkerboard.ts`

**Interfaces:**
- Consumes from Task 1: `Stroke`, `BrushMode`.
- Produces (used by Tasks 4–5):
  - `drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale: number, colors: Record<BrushMode, string>, featherPx?: number): void`
  - `renderCorrections(strokes: Stroke[], targetWidth: number, targetHeight: number, scale: number): Uint8ClampedArray` — RGBA data in the exact encoding `mergeAlpha` consumes.
  - `extractAlpha(bitmap: ImageBitmap, targetWidth: number, targetHeight: number): Uint8ClampedArray`
  - `compositeResult(original: ImageBitmap, alpha: Uint8ClampedArray, targetWidth: number, targetHeight: number): HTMLCanvasElement`
  - `canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob>`
  - `checkerboard` style object (from `checkerboard.ts`).

**No unit tests:** jsdom has no canvas implementation, and these functions are deliberately thin — all decision logic (coverage → alpha) already lives in tested `mask.ts`. They are exercised end-to-end in Tasks 6–7.

- [ ] **Step 1: Create the shared checkerboard style**

Create `src/tools/background-remover/checkerboard.ts` (extracted from `BackgroundRemover.tsx` — the original constant is removed in Task 5):

```typescript
/** Checkerboard so transparency is visible behind the result. */
export const checkerboard = {
  backgroundImage: 'repeating-conic-gradient(rgba(128,128,128,0.25) 0% 25%, transparent 0% 50%)',
  backgroundSize: '16px 16px',
} as const
```

- [ ] **Step 2: Create the canvas adapters**

Create `src/tools/background-remover/render.ts`:

```typescript
import type { BrushMode, Stroke } from './mask'

/** Feather radius at full resolution so corrections don't look jagged. */
const FEATHER_PX = 1.5

function make2d(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D is not available')
  return [canvas, ctx]
}

/**
 * Draw strokes (stored in full-image coordinates) onto `ctx` at `scale`.
 * Used both for the on-screen overlay tints and for the correction layer.
 */
export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  scale: number,
  colors: Record<BrushMode, string>,
  featherPx = 0,
): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.filter = featherPx > 0 ? `blur(${featherPx}px)` : 'none'
  for (const stroke of strokes) {
    const color = colors[stroke.mode]
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = stroke.size * scale
    const points = stroke.points
    ctx.beginPath()
    if (points.length === 1) {
      // A zero-length path draws nothing in some browsers — use a dot.
      ctx.arc(points[0].x * scale, points[0].y * scale, (stroke.size * scale) / 2, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.moveTo(points[0].x * scale, points[0].y * scale)
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x * scale, points[i].y * scale)
      }
      ctx.stroke()
    }
  }
  ctx.filter = 'none'
}

/**
 * Rasterize strokes into the RGBA correction layer `mergeAlpha` consumes:
 * keep = green, remove = red, alpha = coverage. Later strokes overwrite
 * earlier ones (normal source-over painting), so stroke order wins.
 */
export function renderCorrections(
  strokes: Stroke[],
  targetWidth: number,
  targetHeight: number,
  scale: number,
): Uint8ClampedArray {
  const [, ctx] = make2d(targetWidth, targetHeight)
  drawStrokes(ctx, strokes, scale, { keep: '#00ff00', remove: '#ff0000' }, FEATHER_PX * scale)
  return ctx.getImageData(0, 0, targetWidth, targetHeight).data
}

/** Alpha channel of `bitmap` resampled to the target size. */
export function extractAlpha(
  bitmap: ImageBitmap,
  targetWidth: number,
  targetHeight: number,
): Uint8ClampedArray {
  const [, ctx] = make2d(targetWidth, targetHeight)
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)
  const data = ctx.getImageData(0, 0, targetWidth, targetHeight).data
  const alpha = new Uint8ClampedArray(targetWidth * targetHeight)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
  return alpha
}

/** Original RGB with the corrected alpha applied. */
export function compositeResult(
  original: ImageBitmap,
  alpha: Uint8ClampedArray,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement {
  const [canvas, ctx] = make2d(targetWidth, targetHeight)
  ctx.drawImage(original, 0, 0, targetWidth, targetHeight)
  const image = ctx.getImageData(0, 0, targetWidth, targetHeight)
  for (let i = 0; i < alpha.length; i++) image.data[i * 4 + 3] = alpha[i]
  ctx.putImageData(image, 0, 0)
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      'image/png',
    )
  })
}
```

- [ ] **Step 3: Lint, typecheck, full test run**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: zero errors, all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/tools/background-remover/render.ts src/tools/background-remover/checkerboard.ts
git commit -m "feat(background-remover): canvas adapters for stroke rasterization and compositing"
```

---

### Task 4: FineTuneEditor component

**Files:**
- Create: `src/tools/background-remover/FineTuneEditor.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–3; `Button`, `ProgressBar` from `src/components/`; `cx` from `src/lib/cx`.
- Produces (used by Task 5):
  - `FineTuneEditor` (named export), props:
    - `sourceUrl: string` — object URL of the original photo
    - `resultBlob: Blob` — current background-removed PNG
    - `onApply: (blob: Blob) => void` — full-resolution corrected PNG
    - `onCancel: () => void`

**No unit tests:** the component's mount path requires real canvas pixel APIs (`createImageBitmap`, `getImageData`) that jsdom lacks; every branchy decision (history semantics, alpha math, scaling) is already unit-tested in `mask.ts`. Behavior is verified in Tasks 6–7.

- [ ] **Step 1: Create the component**

Create `src/tools/background-remover/FineTuneEditor.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Brush, Check, Eraser, Redo2, Trash2, Undo2, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { checkerboard } from './checkerboard'
import {
  activeStrokes,
  canRedo,
  canUndo,
  emptyHistory,
  fitScale,
  mergeAlpha,
  pushStroke,
  redo,
  undo,
  type BrushMode,
  type Stroke,
  type StrokeHistory,
  type StrokePoint,
} from './mask'
import {
  canvasToBlob,
  compositeResult,
  drawStrokes,
  extractAlpha,
  renderCorrections,
} from './render'

/** Overlay tints per spec: stroke being drawn at 0.5 alpha, committed at 0.2. */
const ACTIVE_TINT: Record<BrushMode, string> = {
  keep: 'rgba(34,197,94,0.5)',
  remove: 'rgba(239,68,68,0.5)',
}
const DONE_TINT: Record<BrushMode, string> = {
  keep: 'rgba(34,197,94,0.2)',
  remove: 'rgba(239,68,68,0.2)',
}

interface Loaded {
  original: ImageBitmap
  /** Alpha channel of the AI result at display size (live-preview base). */
  previewBase: Uint8ClampedArray
  /** display px per image px */
  scale: number
  displayWidth: number
  displayHeight: number
}

export interface FineTuneEditorProps {
  /** Object URL of the original photo. */
  sourceUrl: string
  /** Current background-removed result. */
  resultBlob: Blob
  /** Receives the full-resolution corrected PNG. */
  onApply: (blob: Blob) => void
  onCancel: () => void
}

export function FineTuneEditor({ sourceUrl, resultBlob, onApply, onCancel }: FineTuneEditorProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [history, setHistory] = useState<StrokeHistory>(emptyHistory)
  const [mode, setMode] = useState<BrushMode>('remove')
  const [brushSize, setBrushSize] = useState(0) // diameter in image px, set on load
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const resultBitmapRef = useRef<ImageBitmap | null>(null)
  const currentStroke = useRef<Stroke | null>(null)
  const hoverPos = useRef<StrokePoint | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [original, resultBitmap] = await Promise.all([
          fetch(sourceUrl)
            .then((r) => r.blob())
            .then((b) => createImageBitmap(b)),
          createImageBitmap(resultBlob),
        ])
        if (cancelled) return
        const maxWidth = wrapperRef.current?.clientWidth ?? 800
        const maxHeight = Math.round(window.innerHeight * 0.6)
        const scale = fitScale(original.width, original.height, maxWidth, maxHeight)
        const displayWidth = Math.max(1, Math.round(original.width * scale))
        const displayHeight = Math.max(1, Math.round(original.height * scale))
        resultBitmapRef.current = resultBitmap
        setLoaded({
          original,
          previewBase: extractAlpha(resultBitmap, displayWidth, displayHeight),
          scale: displayWidth / original.width,
          displayWidth,
          displayHeight,
        })
        setBrushSize(Math.max(8, Math.round(Math.min(original.width, original.height) / 20)))
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError('Could not open the editor for this image — it may be too large for this device.')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sourceUrl, resultBlob])

  // Live preview: recomposite at display resolution on stroke end / undo /
  // redo / clear. Cheap — display-size pixels only.
  useEffect(() => {
    if (!loaded) return
    const ctx = previewRef.current?.getContext('2d')
    if (!ctx) return
    const { original, previewBase, scale, displayWidth, displayHeight } = loaded
    const corrections = renderCorrections(activeStrokes(history), displayWidth, displayHeight, scale)
    const alpha = mergeAlpha(previewBase, corrections)
    ctx.clearRect(0, 0, displayWidth, displayHeight)
    ctx.drawImage(compositeResult(original, alpha, displayWidth, displayHeight), 0, 0)
  }, [loaded, history])

  const redrawOverlay = useCallback(() => {
    const ctx = overlayRef.current?.getContext('2d')
    if (!ctx || !loaded) return
    ctx.clearRect(0, 0, loaded.displayWidth, loaded.displayHeight)
    drawStrokes(ctx, activeStrokes(history), loaded.scale, DONE_TINT)
    if (currentStroke.current) drawStrokes(ctx, [currentStroke.current], loaded.scale, ACTIVE_TINT)
    if (hoverPos.current && brushSize > 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.arc(
        hoverPos.current.x * loaded.scale,
        hoverPos.current.y * loaded.scale,
        (brushSize * loaded.scale) / 2,
        0,
        Math.PI * 2,
      )
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [loaded, history, brushSize])

  useEffect(() => {
    redrawOverlay()
  }, [redrawOverlay])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && e.shiftKey) {
        e.preventDefault()
        setHistory(redo)
      } else if (key === 'z') {
        e.preventDefault()
        setHistory(undo)
      } else if (key === 'y') {
        e.preventDefault()
        setHistory(redo)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function toImagePoint(e: React.PointerEvent<HTMLCanvasElement>): StrokePoint {
    if (!loaded) return { x: 0, y: 0 }
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / loaded.scale,
      y: (e.clientY - rect.top) / loaded.scale,
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!loaded || applying) return
    e.currentTarget.setPointerCapture(e.pointerId)
    currentStroke.current = { mode, size: brushSize, points: [toImagePoint(e)] }
    redrawOverlay()
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!loaded) return
    const point = toImagePoint(e)
    hoverPos.current = point
    if (currentStroke.current) currentStroke.current.points.push(point)
    redrawOverlay()
  }

  function handlePointerUp() {
    const stroke = currentStroke.current
    if (!stroke) return
    currentStroke.current = null
    setHistory((h) => pushStroke(h, stroke))
  }

  function handlePointerLeave() {
    hoverPos.current = null
    redrawOverlay()
  }

  async function apply() {
    const original = loaded?.original
    const resultBitmap = resultBitmapRef.current
    if (!original || !resultBitmap) return
    setApplying(true)
    setError(null)
    try {
      const { width, height } = original
      const corrections = renderCorrections(activeStrokes(history), width, height, 1)
      const alpha = mergeAlpha(extractAlpha(resultBitmap, width, height), corrections)
      onApply(await canvasToBlob(compositeResult(original, alpha, width, height)))
    } catch (err) {
      console.error(err)
      setError(
        'Applying at full resolution failed — the image may be too large for this device. Your strokes are still here; you can keep editing or cancel.',
      )
    } finally {
      setApplying(false)
    }
  }

  function cancel() {
    if (canUndo(history) && !window.confirm('Discard your fine-tune strokes?')) return
    onCancel()
  }

  const minDim = loaded ? Math.min(loaded.original.width, loaded.original.height) : 0
  const brushMin = Math.max(4, Math.round(minDim / 100))
  const brushMax = Math.max(brushMin + 1, Math.round(minDim / 5))

  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex overflow-hidden rounded-md border border-line-strong">
          {(['keep', 'remove'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cx(
                'flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors not-first:border-l not-first:border-line',
                mode === m
                  ? m === 'keep'
                    ? 'bg-green-600 text-white'
                    : 'bg-red-600 text-white'
                  : 'bg-card text-muted hover:bg-mint',
              )}
            >
              {m === 'keep' ? <Brush className="size-3.5" /> : <Eraser className="size-3.5" />}
              {m === 'keep' ? 'Keep' : 'Remove'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Brush
          <input
            type="range"
            min={brushMin}
            max={brushMax}
            value={brushSize}
            disabled={!loaded}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
        </label>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={!canUndo(history)}
            onClick={() => setHistory(undo)}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canRedo(history)}
            onClick={() => setHistory(redo)}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canUndo(history)}
            onClick={() => setHistory(emptyHistory)}
            aria-label="Clear all strokes"
            title="Clear all strokes"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" disabled={!loaded || applying} onClick={() => void apply()}>
            <Check className="size-4" />
            {applying ? 'Applying…' : 'Apply'}
          </Button>
          <Button variant="secondary" size="sm" disabled={applying} onClick={cancel}>
            <X className="size-4" />
            Cancel
          </Button>
        </div>
      </div>

      <div ref={wrapperRef} className="flex justify-center">
        {!loaded && !error && <ProgressBar className="my-10 w-full max-w-md" label="Opening editor…" />}
        {error && (
          <p role="alert" className="my-6 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        {loaded && (
          <div
            className="relative touch-none overflow-hidden rounded-md"
            style={{ width: loaded.displayWidth, height: loaded.displayHeight, ...checkerboard }}
          >
            <img
              src={sourceUrl}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute inset-0 h-full w-full opacity-25"
            />
            <canvas
              ref={previewRef}
              width={loaded.displayWidth}
              height={loaded.displayHeight}
              className="absolute inset-0"
            />
            <canvas
              ref={overlayRef}
              width={loaded.displayWidth}
              height={loaded.displayHeight}
              className="absolute inset-0 cursor-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
            />
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-faint">
        Paint green over parts to bring back, red over parts to erase. The preview updates as you
        paint; Apply renders the change at full resolution.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Lint, typecheck, full test run**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: zero errors. If the linter flags the error-state `<p>` color classes or `window.confirm`, fix the code (e.g. match the error-block styling already used in `BackgroundRemover.tsx`) — do not disable rules.

- [ ] **Step 3: Commit**

```bash
git add src/tools/background-remover/FineTuneEditor.tsx
git commit -m "feat(background-remover): fine-tune editor with keep/remove brushes, live preview, undo/redo"
```

---

### Task 5: Wire the editor into BackgroundRemover

**Files:**
- Modify: `src/tools/background-remover/BackgroundRemover.tsx`

**Interfaces:**
- Consumes from Task 4: `FineTuneEditor`; from Task 3: `checkerboard`.
- Produces: the user-facing flow — `done` view gains a Fine-tune button; new `tune` phase; Apply swaps the result blob/URL (Download then serves the corrected PNG); Cancel returns to `done`.

- [ ] **Step 1: Update imports and the Phase union**

In `src/tools/background-remover/BackgroundRemover.tsx`:

Change the lucide import (line 2) to:

```tsx
import { Download, Paintbrush, RotateCcw } from 'lucide-react'
```

Add after the existing local imports (after the `./progress` import on line 11):

```tsx
import { checkerboard } from './checkerboard'
import { FineTuneEditor } from './FineTuneEditor'
```

Change the phase type (line 14) to:

```tsx
type Phase = 'idle' | 'working' | 'done' | 'tune' | 'error'
```

Delete the local `checkerboard` constant (lines 21–25, including its comment) — it now lives in `checkerboard.ts`.

- [ ] **Step 2: Add the Fine-tune button to the done view**

In the `phase === 'done'` action row, insert between the Download button/size span and the "Another image" button:

```tsx
            <Button variant="secondary" onClick={() => setPhase('tune')}>
              <Paintbrush className="size-4" />
              Fine-tune
            </Button>
```

The row becomes: Download PNG · file size · Fine-tune · Another image.

- [ ] **Step 3: Render the tune phase**

Add after the entire `{phase === 'done' && ...}` block (before `{phase === 'error' && ...}`):

```tsx
      {phase === 'tune' && source && result && (
        <FineTuneEditor
          sourceUrl={source.url}
          resultBlob={result.blob}
          onApply={(blob) => {
            setResult((prev) => {
              if (prev) URL.revokeObjectURL(prev.url)
              return {
                blob,
                url: URL.createObjectURL(blob),
                name: prev ? prev.name : 'image-no-background.png',
              }
            })
            setPhase('done')
          }}
          onCancel={() => setPhase('done')}
        />
      )}
```

- [ ] **Step 4: Lint, typecheck, full test run**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: zero errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/background-remover/BackgroundRemover.tsx
git commit -m "feat(background-remover): fine-tune phase with apply/cancel round-trip"
```

---

### Task 6: T3 visual verification (dev build)

**Files:** none created (screenshots go to a temp dir, not the repo).

**Interfaces:** consumes the complete feature from Tasks 1–5.

Use the **webapp-testing skill** (Playwright) for all browser steps.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background). Note the port (default 5173).

- [ ] **Step 2: Prepare a test photo**

Any real photo with a clear subject works. If none is at hand, create one with Playwright: render a 1200×900 HTML page with a strongly-colored irregular figure (e.g. dark silhouette with thin protrusions) on a busy gradient background, screenshot it to `/tmp/fine-tune-test-photo.png`, and use that as the upload. Thin protrusions matter — they give the AI something to get wrong so Keep corrections are actually exercised.

- [ ] **Step 3: Exercise the full flow at 1280 px, light theme**

1. Open `/tools/background-remover`, upload the test photo, wait for the result (model download can take a minute on first run).
2. Click **Fine-tune** → editor opens: checkerboard, faint original underneath, live preview on top; toolbar shows Keep/Remove, brush slider, Undo/Redo/Clear disabled, Apply/Cancel.
3. Paint a **Remove** stroke over a kept area → stroke shows red at 0.5 alpha while dragging; on release the preview updates (area becomes transparent) and the mark fades to the subtle tint. Undo enables.
4. Switch to **Keep**, paint over a removed area → preview restores those pixels (visible because the faint original shows what was there).
5. **Undo** twice (button once, `Ctrl+Z` once) → preview reverts each time. **Redo** twice (button + `Ctrl+Shift+Z`) → strokes return.
6. **Clear strokes** → preview returns to the AI result; Undo/Redo/Clear disable. Then redo is unavailable (clear resets history) — paint both strokes again.
7. Click **Apply** → returns to the compare view; the result image reflects both corrections.
8. **Download PNG** → the downloaded file contains the corrections at the original image's full pixel dimensions (verify dimensions, e.g. with a quick script or by re-uploading to the image-resize tool).
9. Re-enter Fine-tune → editor starts from the corrected result with empty history. Paint one stroke, click **Cancel** → confirm dialog appears; accept → back at compare view, result unchanged.
10. Screenshot the editor (with strokes visible) and the post-apply compare view.

- [ ] **Step 4: Privacy check**

With the network log recording during the entire Step 3 session: the only requests allowed are same-origin page/assets/model files. **Zero requests during fine-tuning itself, and no request anywhere containing image data.** Record the observed request list in the task notes.

- [ ] **Step 5: Repeat visually at 390 px and in dark theme**

- 390 px viewport, light: editor fits (canvas scales down, toolbar wraps), painting works via touch/pointer. Screenshot.
- 1280 px + dark theme (toggle in header): toolbar, tints and checkerboard remain legible. Screenshot.
- 390 px + dark: screenshot.

- [ ] **Step 6: Fix anything found, then gate**

Fix defects immediately (each fix follows lint+typecheck+test before commit). When clean:

Run: `npm run lint && npm run typecheck && npm run test`
Expected: zero errors.

---

### Task 7: T4 second-pass verification (production build)

**Files:** none.

**Interfaces:** consumes the verified feature from Task 6.

- [ ] **Step 1: Fresh production build**

Run: `npm run build`
Expected: build succeeds. Check the bundle report: `dist/assets` must show no new heavy chunk on the dashboard route — the fine-tune code ships inside the background-remover route chunk (CLAUDE.md rule 3).

- [ ] **Step 2: Serve and re-verify**

Run: `npm run preview` (background). Repeat Task 6 Steps 3–5 (the full flow, privacy check, and the 4 screenshot matrix cells) against the preview server. COOP/COEP headers are active in preview — confirm the tool still works under `crossOriginIsolated`.

- [ ] **Step 3: Final gates and PLAN.md tick**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: zero errors.

If PLAN.md tracks per-phase verification checkboxes for Phase 8, update them to reflect the fine-tune addition (do not restructure PLAN.md otherwise).

```bash
git add PLAN.md
git commit -m "docs: record fine-tune verification for background remover"
```

(Skip the commit if PLAN.md needed no change.)
