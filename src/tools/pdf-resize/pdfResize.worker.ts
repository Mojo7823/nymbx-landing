/// <reference lib="webworker" />
import { expose } from 'comlink'
import { PDFDocument } from 'pdf-lib'
import { computeTransform, type ResizeMode } from './resizeMath'

export interface PdfInfo {
  pageCount: number
  pages: { width: number; height: number }[]
  mixedOrientation: boolean
}

export interface ResizeOptions {
  targetWidth: number
  targetHeight: number
  mode: ResizeMode
  autoRotate: boolean
}

export interface ImagePage {
  jpg: Uint8Array
  /** Page box size in points (original page dimensions). */
  width: number
  height: number
}

const api = {
  /** Read page sizes; throws with pdf-lib's message for encrypted/corrupt files. */
  async inspect(bytes: Uint8Array): Promise<PdfInfo> {
    const doc = await PDFDocument.load(bytes)
    const pages = doc.getPages().map((p) => {
      const { width, height } = p.getSize()
      return { width, height }
    })
    const landscapeCount = pages.filter((p) => p.width > p.height).length
    return {
      pageCount: pages.length,
      pages,
      mixedOrientation: landscapeCount > 0 && landscapeCount < pages.length,
    }
  },

  /**
   * Resize every page. Content is scaled via `page.scale()` (which also
   * scales annotations), then the page box origin is shifted to center it —
   * annotation rectangles stay aligned because nothing else moves.
   */
  async resize(bytes: Uint8Array, options: ResizeOptions): Promise<Uint8Array> {
    const doc = await PDFDocument.load(bytes)
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize()
      const t = computeTransform({ srcWidth: width, srcHeight: height, ...options })
      if (t.scale !== 1) page.scale(t.scale, t.scale)
      page.setMediaBox(-t.offsetX, -t.offsetY, t.pageWidth, t.pageHeight)
      page.setCropBox(-t.offsetX, -t.offsetY, t.pageWidth, t.pageHeight)
    }
    return doc.save()
  },

  /** Build a PDF from pre-rendered JPEG pages (reduce-file-size mode). */
  async assembleImagePdf(pages: ImagePage[]): Promise<Uint8Array> {
    const doc = await PDFDocument.create()
    for (const { jpg, width, height } of pages) {
      const image = await doc.embedJpg(jpg)
      const page = doc.addPage([width, height])
      page.drawImage(image, { x: 0, y: 0, width, height })
    }
    return doc.save()
  },
}

export type PdfResizeWorkerApi = typeof api

expose(api)
