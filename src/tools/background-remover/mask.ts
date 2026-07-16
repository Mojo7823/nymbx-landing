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
