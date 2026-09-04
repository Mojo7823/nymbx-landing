/// <reference lib="webworker" />
import { expose, transfer } from 'comlink'
import encodeJpeg, { init as initJpeg } from '@jsquash/jpeg/encode'
import encodePng, { init as initPng } from '@jsquash/png/encode'
import encodeWebp, { init as initWebp } from '@jsquash/webp/encode'
import encodeAvif, { init as initAvif } from '@jsquash/avif/encode'
import type { FlattenColor, OutputFormat } from './converter'

export interface ConvertJob {
  format: OutputFormat
  /** 1–100 (ignored for PNG). */
  quality: number
  /** JPEG has no alpha — transparent pixels land on this color. */
  flatten: FlattenColor
}

export interface ConvertResult {
  buffer: ArrayBuffer
  mime: string
  width: number
  height: number
}

// Codec WASM binaries ship as hashed build assets next to the worker chunk
// (Vite emits them from the packages automatically), so the default module
// resolution already fetches everything same-origin — no CDN is involved.
const initialized = new Set<OutputFormat>()

async function ensureCodec(format: OutputFormat): Promise<void> {
  if (initialized.has(format)) return
  if (format === 'jpeg') await initJpeg()
  else if (format === 'webp') await initWebp()
  else if (format === 'avif') await initAvif()
  else await initPng()
  initialized.add(format)
}

const api = {
  /** Oriented dimensions (EXIF rotation applied), for the file list. */
  async dimensions(file: Blob): Promise<{ width: number; height: number }> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const dims = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dims
  },

  async convert(input: Blob, job: ConvertJob): Promise<ConvertResult> {
    await ensureCodec(job.format)
    const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' })
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Could not create a canvas context')
      if (job.format === 'jpeg') {
        context.fillStyle = job.flatten
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      context.drawImage(bitmap, 0, 0)
      const image = context.getImageData(0, 0, canvas.width, canvas.height)

      let buffer: ArrayBuffer
      if (job.format === 'jpeg') buffer = await encodeJpeg(image, { quality: job.quality })
      else if (job.format === 'webp') buffer = await encodeWebp(image, { quality: job.quality })
      else if (job.format === 'avif') buffer = await encodeAvif(image, { quality: job.quality })
      else buffer = await encodePng(image)

      const mime =
        job.format === 'png'
          ? 'image/png'
          : job.format === 'jpeg'
            ? 'image/jpeg'
            : job.format === 'webp'
              ? 'image/webp'
              : 'image/avif'
      const result: ConvertResult = { buffer, mime, width: canvas.width, height: canvas.height }
      return transfer(result, [buffer])
    } finally {
      bitmap.close()
    }
  },
}

export type ConvertWorkerApi = typeof api

expose(api)
