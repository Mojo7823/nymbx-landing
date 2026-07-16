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
  // Browsers without canvas filter support (e.g. older Safari) silently
  // ignore `ctx.filter`, so the blur is skipped and corrections come out
  // hard-edged instead of feathered. Accepted graceful degradation.
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
