/// <reference lib="webworker" />
import { expose } from 'comlink'
import { PDFDocument } from 'pdf-lib'

const api = {
  /** Merge the documents in the given order into one PDF. */
  async merge(
    docs: Uint8Array[],
    onProgress?: (docsDone: number, docCount: number) => void,
  ): Promise<Uint8Array> {
    const out = await PDFDocument.create()
    let done = 0
    for (const bytes of docs) {
      const src = await PDFDocument.load(bytes)
      const copied = await out.copyPages(src, src.getPageIndices())
      for (const page of copied) out.addPage(page)
      onProgress?.(++done, docs.length)
    }
    return out.save()
  },
}

export type MergeWorkerApi = typeof api

expose(api)
