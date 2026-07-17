/// <reference lib="webworker" />
import { expose } from 'comlink'
import { PDFDocument, degrees } from 'pdf-lib'
import { jpegOrientation } from './exif'
import { isMirrored, placeOnPage, rotatedDraw, swapsDimensions, type PageMode } from './pageLayout'

/**
 * Mirrored EXIF orientations (2, 4, 5, 7) can't be displayed by rotation
 * alone — re-encode those upright. Everything else embeds the original bytes
 * untouched, so quality is never degraded.
 */
async function reencodeUpright(image: Blob): Promise<Uint8Array<ArrayBuffer>> {
  const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' })
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create a canvas context')
    ctx.drawImage(bitmap, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 })
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    bitmap.close()
  }
}

const api = {
  /** One page per image, in the given order. */
  async build(
    files: File[],
    mode: PageMode,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Uint8Array> {
    const doc = await PDFDocument.create()
    let done = 0
    for (const file of files) {
      let bytes = new Uint8Array(await file.arrayBuffer())
      const isPng = bytes.length > 1 && bytes[0] === 0x89 && bytes[1] === 0x50
      let orientation = isPng ? 1 : jpegOrientation(bytes)
      if (isMirrored(orientation)) {
        bytes = await reencodeUpright(file)
        orientation = 1
      }
      const image = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
      const swap = swapsDimensions(orientation)
      const placement = placeOnPage(
        swap ? image.height : image.width,
        swap ? image.width : image.height,
        mode,
      )
      const page = doc.addPage([placement.pageWidth, placement.pageHeight])
      const draw = rotatedDraw(orientation as 1 | 3 | 6 | 8, placement)
      page.drawImage(image, {
        x: draw.x,
        y: draw.y,
        width: draw.width,
        height: draw.height,
        rotate: degrees(draw.rotate),
      })
      onProgress?.(++done, files.length)
    }
    return doc.save()
  },
}

export type BuildWorkerApi = typeof api

expose(api)
