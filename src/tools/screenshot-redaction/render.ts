import { pixelateInPlace, hardenAlpha } from './pixelate'
import { clampBox, pixelBox, regionBounds, type BrushRegion, type Region } from './regions'

/**
 * Canvas glue: painting redactions into the working canvas and encoding it.
 *
 * The working canvas **is** the preview: every region is burned into its
 * pixels, so what the user sees is exactly what `toBlob` writes out. Nothing
 * here is a cosmetic overlay, and the original bitmap is only ever read.
 */

export type ExportFormat = 'png' | 'jpeg'

/** Trace a brush stroke's polyline, optionally offset into a sub-canvas. */
function traceStroke(ctx: CanvasRenderingContext2D, region: BrushRegion, dx = 0, dy = 0): boolean {
  const points = region.points
  if (points.length === 0) return false
  ctx.beginPath()
  const first = points[0]
  ctx.moveTo(first.x - dx, first.y - dy)
  if (points.length === 1) {
    // A single tap: a hairline segment plus the round cap paints one dot.
    ctx.lineTo(first.x - dx + 0.01, first.y - dy)
  } else {
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x - dx, points[i].y - dy)
  }
  ctx.lineWidth = region.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  return true
}

/** Paint one region into the canvas, destroying the pixels underneath it. */
function applyRegion(
  ctx: CanvasRenderingContext2D,
  region: Region,
  width: number,
  height: number,
): void {
  const box = pixelBox(clampBox(regionBounds(region), width, height), width, height)
  if (box.width === 0 || box.height === 0) return

  if (region.mode === 'black') {
    ctx.save()
    ctx.fillStyle = region.color
    ctx.strokeStyle = region.color
    if (region.kind === 'rect') {
      ctx.fillRect(box.x, box.y, box.width, box.height)
    } else if (traceStroke(ctx, region)) {
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  // Pixelate: read back only this region's bounding box, never the whole
  // frame, and replace each cell with its mean colour.
  const image = ctx.getImageData(box.x, box.y, box.width, box.height)
  pixelateInPlace(image.data, box.width, box.height, region.block)

  if (region.kind === 'rect') {
    ctx.putImageData(image, box.x, box.y)
    return
  }

  // Brush: build one hard-edged mask of the stroke (anti-aliased edge alpha
  // thresholded to 0/255), erase exactly that area from the frame, then draw
  // the mosaic through the same mask. Using a single binary mask for both
  // passes means no semi-transparent halo can survive in the export.
  const mask = document.createElement('canvas')
  mask.width = box.width
  mask.height = box.height
  const maskCtx = mask.getContext('2d', { willReadFrequently: true })
  if (!maskCtx) return
  maskCtx.strokeStyle = '#000000'
  if (!traceStroke(maskCtx, region, box.x, box.y)) return
  maskCtx.stroke()
  const maskData = maskCtx.getImageData(0, 0, box.width, box.height)
  hardenAlpha(maskData.data)
  maskCtx.putImageData(maskData, 0, 0)

  const clip = document.createElement('canvas')
  clip.width = box.width
  clip.height = box.height
  const clipCtx = clip.getContext('2d')
  if (!clipCtx) return
  clipCtx.putImageData(image, 0, 0)
  clipCtx.globalCompositeOperation = 'destination-in'
  clipCtx.drawImage(mask, 0, 0)

  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(mask, box.x, box.y)
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(clip, box.x, box.y)
  ctx.restore()
}

/**
 * Repaint the working canvas: the untouched original, then every region in
 * order. Called on each history change — one `drawImage` plus region-local
 * pixel work.
 */
export function redraw(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  regions: readonly Region[],
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0)
  for (const region of regions) applyRegion(ctx, region, canvas.width, canvas.height)
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
      type,
      quality,
    )
  })
}

/**
 * Encode the working canvas. A canvas re-encode writes a fresh file, so no
 * EXIF, GPS, XMP or ICC data from the original survives. JPEG has no alpha,
 * so transparency is flattened onto white first.
 */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  quality: number,
): Promise<Blob> {
  if (format !== 'jpeg') return await toBlob(canvas, 'image/png')

  const flat = document.createElement('canvas')
  flat.width = canvas.width
  flat.height = canvas.height
  const ctx = flat.getContext('2d')
  if (!ctx) throw new Error('Could not create a canvas context')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, flat.width, flat.height)
  ctx.drawImage(canvas, 0, 0)
  return await toBlob(flat, 'image/jpeg', quality / 100)
}

export function outputName(inputName: string, format: ExportFormat): string {
  const stem = inputName.replace(/\.[^.]+$/, '') || 'screenshot'
  return `${stem}.redacted.${format === 'jpeg' ? 'jpg' : 'png'}`
}
