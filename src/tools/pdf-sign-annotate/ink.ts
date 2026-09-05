import { getStroke } from 'perfect-freehand'

/** A sampled pen point in viewed points (relative to the object's top-left). */
export interface InkPoint {
  x: number
  y: number
  /** Pointer pressure, 0..1; 0.5 when the device reports none. */
  p: number
}

/** One pen-down → pen-up polyline. An ink object may hold several. */
export type InkStroke = InkPoint[]

/**
 * perfect-freehand options. The same options are used for the on-screen
 * preview and for the exported PDF path, so the two geometries are identical.
 */
export const STROKE_OPTIONS = {
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: true,
  last: true,
} as const

const average = (a: number, b: number): number => (a + b) / 2

/**
 * Turn a perfect-freehand outline into an SVG path (from the library README).
 * The result is a **filled** path — never stroke it.
 */
export function getSvgPathFromStroke(points: number[][], closed = true): string {
  const len = points.length
  if (len < 4) return ''

  // Every segment is written as an explicit `Q control end`. The upstream
  // helper uses the `T` shorthand after the first segment; browsers render it
  // correctly, but pdf-lib 1.17 mis-parses `T`, so exported strokes came out
  // as a sawtooth while the preview looked right. In this construction the
  // implicit control point of each `T` is exactly `points[i]`, so spelling
  // the `Q` out is geometrically identical on both sides.
  const f = (n: number) => n.toFixed(2)
  const [a, b, c] = [points[0], points[1], points[2]]
  let result = `M${f(a[0])},${f(a[1])} Q${f(b[0])},${f(b[1])} ${f(average(b[0], c[0]))},${f(
    average(b[1], c[1]),
  )}`

  for (let i = 2, max = len - 1; i < max; i++) {
    const p = points[i]
    const q = points[i + 1]
    result += ` Q${f(p[0])},${f(p[1])} ${f(average(p[0], q[0]))},${f(average(p[1], q[1]))}`
  }

  if (closed) result += ' Z'
  return result
}

/** Outline path for one stroke at `thickness` (viewed points). */
export function strokeToPath(stroke: InkStroke, thickness: number): string {
  if (stroke.length === 0) return ''
  const outline = getStroke(
    stroke.map((pt) => [pt.x, pt.y, pt.p]),
    { ...STROKE_OPTIONS, size: thickness },
  )
  return getSvgPathFromStroke(outline)
}

/** Outline path for a whole ink object — one sub-path per stroke. */
export function strokesToPath(strokes: readonly InkStroke[], thickness: number): string {
  return strokes
    .map((s) => strokeToPath(s, thickness))
    .filter(Boolean)
    .join(' ')
}

export interface InkBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Bounding box of the drawn strokes, padded by half the pen thickness. */
export function strokeBounds(strokes: readonly InkStroke[], thickness: number): InkBounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const pt of stroke) {
      if (pt.x < minX) minX = pt.x
      if (pt.y < minY) minY = pt.y
      if (pt.x > maxX) maxX = pt.x
      if (pt.y > maxY) maxY = pt.y
    }
  }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  const pad = thickness / 2
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

/** Shift every point by (dx, dy). */
export function translateStrokes(
  strokes: readonly InkStroke[],
  dx: number,
  dy: number,
): InkStroke[] {
  return strokes.map((s) => s.map((pt) => ({ x: pt.x + dx, y: pt.y + dy, p: pt.p })))
}

/** Scale every point around the local origin. */
export function scaleStrokes(strokes: readonly InkStroke[], factor: number): InkStroke[] {
  return strokes.map((s) => s.map((pt) => ({ x: pt.x * factor, y: pt.y * factor, p: pt.p })))
}
