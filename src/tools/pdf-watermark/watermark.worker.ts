/// <reference lib="webworker" />
import { expose } from 'comlink'
import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { normalizeRotate, placeStamp, viewedSize, type PositionPreset } from './placement'

export interface WatermarkOptions {
  kind: 'text' | 'image'
  text: string
  /** Required when the text needs a Unicode font; fetched by the UI. */
  fontBytes: Uint8Array | null
  fontSize: number
  imageBytes: Uint8Array | null
  imageType: 'png' | 'jpeg'
  /** Image width as a percentage of the viewed page width. */
  scalePct: number
  /** 0..1 */
  opacity: number
  /** Counter-clockwise degrees, as seen by the viewer. */
  rotation: number
  preset: PositionPreset
  /** 1-based page numbers, or every page. */
  pages: number[] | 'all'
}

const MARGIN = 24
const GRAY = rgb(0.45, 0.45, 0.45)

const api = {
  /** Copy page 1 into a standalone PDF — cached by the UI for live preview. */
  async extractFirstPage(bytes: Uint8Array): Promise<Uint8Array> {
    const src = await PDFDocument.load(bytes)
    const out = await PDFDocument.create()
    const [page] = await out.copyPages(src, [0])
    out.addPage(page)
    return out.save()
  },

  /** Stamp the watermark onto the selected pages and return the new PDF. */
  async watermark(bytes: Uint8Array, opts: WatermarkOptions): Promise<Uint8Array> {
    const doc = await PDFDocument.load(bytes)

    const font =
      opts.kind === 'text'
        ? opts.fontBytes
          ? (doc.registerFontkit(fontkit), await doc.embedFont(opts.fontBytes, { subset: true }))
          : await doc.embedFont(StandardFonts.Helvetica)
        : null

    const image =
      opts.kind === 'image' && opts.imageBytes
        ? opts.imageType === 'png'
          ? await doc.embedPng(opts.imageBytes)
          : await doc.embedJpg(opts.imageBytes)
        : null

    const targets =
      opts.pages === 'all' ? doc.getPages().map((_, i) => i) : opts.pages.map((p) => p - 1)

    for (const index of targets) {
      const page = doc.getPage(index)
      const { width: w, height: h } = page.getSize()
      const rotate = normalizeRotate(page.getRotation().angle)

      if (opts.kind === 'text' && font) {
        const sw = font.widthOfTextAtSize(opts.text, opts.fontSize)
        const sh = font.heightAtSize(opts.fontSize)
        const { x, y, drawAngle } = placeStamp(
          w,
          h,
          rotate,
          opts.preset,
          sw,
          sh,
          opts.rotation,
          MARGIN,
        )
        page.drawText(opts.text, {
          x,
          y,
          size: opts.fontSize,
          font,
          color: GRAY,
          opacity: opts.opacity,
          rotate: degrees(drawAngle),
        })
      } else if (image) {
        const { vw } = viewedSize(w, h, rotate)
        const sw = (vw * opts.scalePct) / 100
        const sh = sw * (image.height / image.width)
        const { x, y, drawAngle } = placeStamp(
          w,
          h,
          rotate,
          opts.preset,
          sw,
          sh,
          opts.rotation,
          MARGIN,
        )
        page.drawImage(image, {
          x,
          y,
          width: sw,
          height: sh,
          opacity: opts.opacity,
          rotate: degrees(drawAngle),
        })
      }
    }

    return doc.save()
  },
}

export type WatermarkWorkerApi = typeof api

expose(api)
