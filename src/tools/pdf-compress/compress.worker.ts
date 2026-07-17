/// <reference lib="webworker" />
import { expose } from 'comlink'
import { PDFDocument } from 'pdf-lib'

/**
 * Assembles the compressed PDF incrementally: the main thread renders pages
 * (canvas is unavailable here for pdf.js's full pipeline) and streams each
 * JPEG over, keeping pdf-lib's embedding and the final save off the UI thread.
 */
let doc: PDFDocument | null = null

const api = {
  async start(): Promise<void> {
    doc = await PDFDocument.create()
  },

  /** Add one rendered page; `widthPt`/`heightPt` are the original page size. */
  async addPage(jpeg: Uint8Array, widthPt: number, heightPt: number): Promise<void> {
    if (!doc) throw new Error('start() was not called')
    const image = await doc.embedJpg(jpeg)
    const page = doc.addPage([widthPt, heightPt])
    page.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt })
  },

  async finish(): Promise<Uint8Array> {
    if (!doc) throw new Error('start() was not called')
    const bytes = await doc.save()
    doc = null
    return bytes
  },
}

export type CompressWorkerApi = typeof api

expose(api)
