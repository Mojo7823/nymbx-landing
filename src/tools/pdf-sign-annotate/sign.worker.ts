/// <reference lib="webworker" />
import { expose } from 'comlink'
import { degrees, LineCapStyle, PDFDocument, rgb, type PDFImage } from 'pdf-lib'
import { embedSubsetFont } from '../../lib/pdfFont'
import type { DrawCall } from './exportPlan'

export interface ImageAsset {
  id: string
  bytes: Uint8Array
  type: 'png' | 'jpeg'
}

export interface SignRequest {
  /** The original PDF bytes (a copy; the dropped File is never touched). */
  bytes: Uint8Array
  /** Draw calls produced by `exportPlan` on the main thread. */
  plan: DrawCall[]
  /** Bytes for every image stamp referenced by the plan. */
  images: ImageAsset[]
  /** Noto Sans TC bytes; required when the plan contains text. */
  fontBytes: Uint8Array | null
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const n = Number.parseInt(full, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const api = {
  /** Flatten the plan into the PDF and return the new bytes. */
  async sign({ bytes, plan, images, fontBytes }: SignRequest): Promise<Uint8Array> {
    const doc = await PDFDocument.load(bytes)

    let font = null
    if (plan.some((c) => c.type === 'text')) {
      if (!fontBytes) throw new Error('font')
      font = await embedSubsetFont(doc, fontBytes)
    }

    const embedded = new Map<string, PDFImage>()
    for (const asset of images) {
      if (!plan.some((c) => c.type === 'image' && c.imageId === asset.id)) continue
      embedded.set(
        asset.id,
        asset.type === 'png' ? await doc.embedPng(asset.bytes) : await doc.embedJpg(asset.bytes),
      )
    }

    for (const call of plan) {
      const page = doc.getPage(call.page)
      // A media box whose origin is not (0,0) shifts all of user space.
      const box = page.getMediaBox()
      const x = call.x + box.x
      const y = call.y + box.y
      const rotate = degrees(call.rotate)

      if (call.type === 'text') {
        if (!font) continue
        page.drawText(call.text, {
          x,
          y,
          size: call.size,
          font,
          lineHeight: call.lineHeight,
          color: hexToRgb(call.color),
          rotate,
        })
      } else if (call.type === 'image') {
        const image = embedded.get(call.imageId)
        if (!image) continue
        page.drawImage(image, { x, y, width: call.width, height: call.height, rotate })
      } else {
        page.drawSvgPath(call.path, {
          x,
          y,
          scale: call.scale,
          rotate,
          color: call.fill ? hexToRgb(call.fill) : undefined,
          borderColor: call.stroke ? hexToRgb(call.stroke) : undefined,
          borderWidth: call.stroke ? call.strokeWidth : 0,
          borderLineCap: LineCapStyle.Round,
        })
      }
    }

    return doc.save()
  },
}

export type SignWorkerApi = typeof api

expose(api)
