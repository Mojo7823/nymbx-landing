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
