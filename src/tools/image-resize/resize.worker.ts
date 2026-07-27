/// <reference lib="webworker" />
import createPica from 'pica'
import { expose, transfer } from 'comlink'
import { MIN_TARGET_EDGE, nextScale } from './resizeMath'

// 'ww' (pica's own nested workers) is skipped — we already run off the main thread.
const pica = createPica({ features: ['js', 'wasm'] })
// Pica's internal createCanvas falls back to document.createElement, which
// doesn't exist in a worker — force OffscreenCanvas for its temp canvases.
pica.createCanvas = (width: number, height: number) => new OffscreenCanvas(width, height)

export interface ResizeRequest {
  width: number
  height: number
  /** Requested output mime; the browser may fall back (reported in the result). */
  mime: string
  /** 0–1, used by lossy encoders. */
  quality: number
}

export interface ResizeResult {
  buffer: ArrayBuffer
  /** Actual encoded mime (e.g. PNG fallback when WebP encoding is unsupported). */
  mime: string
  width: number
  height: number
}

export interface TargetSizeRequest {
  targetBytes: number
  /** Size targeting needs a lossy encoder. */
  mime: 'image/jpeg' | 'image/webp'
}

export interface TargetSizeResult extends ResizeResult {
  /** False when even the smallest attempt stayed above the target (best effort shipped). */
  achieved: boolean
}

const QUALITY_MIN = 0.3
const QUALITY_MAX = 0.92

/** JPEG has no alpha — flatten onto white instead of the default black. */
function flattenForJpeg(canvas: OffscreenCanvas, mime: string): OffscreenCanvas {
  if (mime !== 'image/jpeg') return canvas
  const flat = new OffscreenCanvas(canvas.width, canvas.height)
  const ctx = flat.getContext('2d')
  if (!ctx) throw new Error('Could not create a canvas context')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(canvas, 0, 0)
  return flat
}

async function scaledCanvas(bitmap: ImageBitmap, scale: number, mime: string) {
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(width, height)
  await pica.resize(bitmap, canvas, { filter: 'mks2013' })
  return flattenForJpeg(canvas, mime)
}

const api = {
  /** Oriented dimensions (EXIF rotation applied). */
  async dimensions(file: Blob): Promise<{ width: number; height: number }> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const dims = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dims
  },

  async resize(file: Blob, req: ResizeRequest): Promise<ResizeResult> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    try {
      let canvas = new OffscreenCanvas(req.width, req.height)
      await pica.resize(bitmap, canvas, { filter: 'mks2013' })
      canvas = flattenForJpeg(canvas, req.mime)

      const blob = await canvas.convertToBlob({ type: req.mime, quality: req.quality })
      const buffer = await blob.arrayBuffer()
      return transfer({ buffer, mime: blob.type, width: req.width, height: req.height }, [buffer])
    } finally {
      bitmap.close()
    }
  },

  /**
   * Encode under `targetBytes`: binary-search the quality at full resolution
   * first; only if the floor quality is still too big, shrink dimensions
   * (estimated from the byte overshoot) and search again.
   */
  async resizeToTargetSize(file: Blob, req: TargetSizeRequest): Promise<TargetSizeResult> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    try {
      let scale = 1
      let smallest: { blob: Blob; width: number; height: number } | null = null

      for (let round = 0; round < 8; round++) {
        const canvas = await scaledCanvas(bitmap, scale, req.mime)

        let lo = QUALITY_MIN
        let hi = QUALITY_MAX
        let fit: Blob | null = null
        let roundSmallest: Blob | null = null
        for (let i = 0; i < 6; i++) {
          const quality = (lo + hi) / 2
          const blob = await canvas.convertToBlob({ type: req.mime, quality })
          if (!roundSmallest || blob.size < roundSmallest.size) roundSmallest = blob
          if (blob.size <= req.targetBytes) {
            fit = blob
            lo = quality // fits, so try a higher quality
          } else {
            hi = quality
          }
        }

        const dims = { width: canvas.width, height: canvas.height }
        if (fit) {
          const buffer = await fit.arrayBuffer()
          return transfer({ buffer, mime: fit.type, ...dims, achieved: true }, [buffer])
        }
        if (!smallest || roundSmallest!.size < smallest.blob.size) {
          smallest = { blob: roundSmallest!, ...dims }
        }
        if (Math.max(dims.width, dims.height) <= MIN_TARGET_EDGE) break
        scale = nextScale(scale, roundSmallest!.size, req.targetBytes)
      }

      // Best effort: nothing fit even at the minimum edge.
      const { blob, width, height } = smallest!
      const buffer = await blob.arrayBuffer()
      return transfer({ buffer, mime: blob.type, width, height, achieved: false }, [buffer])
    } finally {
      bitmap.close()
    }
  },
}

export type ResizeWorkerApi = typeof api

expose(api)
