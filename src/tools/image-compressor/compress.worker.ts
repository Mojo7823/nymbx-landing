/// <reference lib="webworker" />
import { expose, transfer } from 'comlink'
import encodeJpeg, { init as initJpeg } from '@jsquash/jpeg/encode'
import encodeWebp, { init as initWebp } from '@jsquash/webp/encode'
import encodeAvif, { init as initAvif } from '@jsquash/avif/encode'
import optimisePng, { init as initOxipng } from '@jsquash/oxipng/optimise'
import type { FlattenColor } from './compress'

// Kept local (mirroring src/tools/image-format-converter/convert.worker.ts)
// so each tool route bundles an independent worker chunk.
type CodecFormat = 'png' | 'jpeg' | 'webp' | 'avif'

export interface CompressJob {
  format: CodecFormat
  /** 1–100 for JPEG/WebP/AVIF. */
  quality: number
  /** Oxipng effort 1–6 for PNG. */
  pngLevel: number
  /** Cap for the longest edge; 0 keeps original dimensions. */
  maxDimension: number
  /** JPEG has no alpha — transparent pixels land on this color. */
  flatten: FlattenColor
}

export interface CompressResult {
  buffer: ArrayBuffer
  mime: string
  width: number
  height: number
}

const initialized = new Set<CodecFormat>()

async function ensureCodec(format: CodecFormat): Promise<void> {
  if (initialized.has(format)) return
  if (format === 'jpeg') await initJpeg()
  else if (format === 'webp') await initWebp()
  else if (format === 'avif') await initAvif()
  else await initOxipng()
  initialized.add(format)
}

/** Downscale by repeated halving — much sharper than one big drawImage step. */
function scaledBitmap(
  source: ImageBitmap,
  targetWidth: number,
  targetHeight: number,
): OffscreenCanvas {
  let current: CanvasImageSource = source
  let width = source.width
  let height = source.height
  while (width / 2 >= targetWidth && height / 2 >= targetHeight) {
    width = Math.floor(width / 2)
    height = Math.floor(height / 2)
    const step = new OffscreenCanvas(width, height)
    const ctx = step.getContext('2d')
    if (!ctx) throw new Error('Could not create a canvas context')
    ctx.drawImage(current, 0, 0, width, height)
    current = step
  }
  const final = new OffscreenCanvas(targetWidth, targetHeight)
  const ctx = final.getContext('2d')
  if (!ctx) throw new Error('Could not create a canvas context')
  ctx.drawImage(current, 0, 0, targetWidth, targetHeight)
  return final
}

const api = {
  async dimensions(file: Blob): Promise<{ width: number; height: number }> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const dims = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dims
  },

  async compress(input: Blob, job: CompressJob): Promise<CompressResult> {
    await ensureCodec(job.format)
    const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' })
    try {
      const scale =
        job.maxDimension > 0
          ? Math.min(1, job.maxDimension / Math.max(bitmap.width, bitmap.height))
          : 1
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      let canvas = scaledBitmap(bitmap, width, height)
      if (job.format === 'jpeg') {
        const flat = new OffscreenCanvas(width, height)
        const context = flat.getContext('2d')
        if (!context) throw new Error('Could not create a canvas context')
        context.fillStyle = job.flatten
        context.fillRect(0, 0, width, height)
        context.drawImage(canvas, 0, 0)
        canvas = flat
      }
      const image = canvas.getContext('2d')?.getImageData(0, 0, width, height)
      if (!image) throw new Error('Could not read image pixels')

      let buffer: ArrayBuffer
      if (job.format === 'jpeg') buffer = await encodeJpeg(image, { quality: job.quality })
      else if (job.format === 'webp') buffer = await encodeWebp(image, { quality: job.quality })
      else if (job.format === 'avif') buffer = await encodeAvif(image, { quality: job.quality })
      else buffer = await optimisePng(image, { level: job.pngLevel })

      const mime =
        job.format === 'png'
          ? 'image/png'
          : job.format === 'jpeg'
            ? 'image/jpeg'
            : job.format === 'webp'
              ? 'image/webp'
              : 'image/avif'
      const result: CompressResult = { buffer, mime, width, height }
      return transfer(result, [buffer])
    } finally {
      bitmap.close()
    }
  },
}

export type CompressWorkerApi = typeof api

expose(api)
