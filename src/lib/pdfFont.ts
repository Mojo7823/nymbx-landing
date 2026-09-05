import * as fontkit from 'fontkit'
import type { PDFDocument, PDFFont } from 'pdf-lib'

/**
 * Unicode font embedding for the PDF tools (watermark, sign & annotate).
 *
 * Why fontkit 2 and not `@pdf-lib/fontkit`: `@pdf-lib/fontkit` 1.1.1 writes a
 * corrupt subset of Noto Sans TC — its `loca`/`glyf` tables disagree, so
 * roughly half of the glyphs render blank in poppler and pdf.js (reproduced
 * 2026-09-05: 6 of 13 glyph outlines broken vs 1 — the space — with fontkit
 * 2.0.4). `src/lib/pdfFont.test.ts` guards against a regression.
 *
 * pdf-lib expects a fontkit whose subsets expose a Node-style
 * `encodeStream()`. fontkit 2 returns the bytes synchronously from
 * `encode()`, so the stream is faked with a microtask emitter.
 */
function encodeStreamShim(bytes: Uint8Array) {
  const handlers: Record<string, ((arg?: unknown) => void) | undefined> = {}
  let scheduled = false
  const stream = {
    on(event: string, cb: (arg?: unknown) => void) {
      handlers[event] = cb
      if (!scheduled) {
        scheduled = true
        queueMicrotask(() => {
          handlers.data?.(bytes)
          handlers.end?.()
        })
      }
      return stream
    },
  }
  return stream
}

type PdfLibFontkit = Parameters<PDFDocument['registerFontkit']>[0]

/** A fontkit 2 instance adapted to the interface pdf-lib's `registerFontkit` wants. */
export const subsettingFontkit = {
  create(bytes: Uint8Array) {
    const font = fontkit.create(bytes)
    const createSubset = font.createSubset.bind(font)
    font.createSubset = () => {
      const subset = createSubset()
      subset.encodeStream = () => encodeStreamShim(subset.encode())
      return subset
    }
    return font
  },
} as unknown as PdfLibFontkit

/** Embed a TrueType/OpenType font, subset to the glyphs actually used. */
export async function embedSubsetFont(doc: PDFDocument, bytes: Uint8Array): Promise<PDFFont> {
  doc.registerFontkit(subsettingFontkit)
  return doc.embedFont(bytes, { subset: true })
}
