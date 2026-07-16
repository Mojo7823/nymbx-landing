/// <reference lib="webworker" />
import { expose } from 'comlink'
import { PDFDocument } from 'pdf-lib'
import { streamZip, type ZipInput } from '../../lib/zipStream'

/** Copy document metadata from `src` so outputs keep title/author/dates. */
function copyMetadata(src: PDFDocument, dst: PDFDocument): void {
  const title = src.getTitle()
  if (title !== undefined) dst.setTitle(title)
  const author = src.getAuthor()
  if (author !== undefined) dst.setAuthor(author)
  const subject = src.getSubject()
  if (subject !== undefined) dst.setSubject(subject)
  const keywords = src.getKeywords()
  if (keywords !== undefined) dst.setKeywords(keywords.split(/\s*[,;]\s*|\s+/))
  const creator = src.getCreator()
  if (creator !== undefined) dst.setCreator(creator)
  const creationDate = src.getCreationDate()
  if (creationDate !== undefined) dst.setCreationDate(creationDate)
  const modificationDate = src.getModificationDate()
  if (modificationDate !== undefined) dst.setModificationDate(modificationDate)
}

async function copyPagesToNewDoc(src: PDFDocument, zeroBasedPages: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, zeroBasedPages)
  for (const page of copied) out.addPage(page)
  copyMetadata(src, out)
  return out.save()
}

const api = {
  /** Extract 1-based `pages` from the document into a single new PDF. */
  async extract(bytes: Uint8Array, pages: number[]): Promise<Uint8Array> {
    const src = await PDFDocument.load(bytes)
    return copyPagesToNewDoc(
      src,
      pages.map((p) => p - 1),
    )
  },

  /** Split every page into its own PDF and zip them as `<baseName>-page-NNN.pdf`. */
  async splitAll(
    bytes: Uint8Array,
    baseName: string,
    onProgress?: (pagesDone: number, pageCount: number) => void,
  ): Promise<Blob> {
    const src = await PDFDocument.load(bytes)
    const pageCount = src.getPageCount()
    const pad = String(pageCount).length
    const entries: ZipInput[] = []
    for (let i = 0; i < pageCount; i++) {
      const data = await copyPagesToNewDoc(src, [i])
      entries.push({
        name: `${baseName}-page-${String(i + 1).padStart(pad, '0')}.pdf`,
        blob: new Blob([data as BlobPart], { type: 'application/pdf' }),
      })
      onProgress?.(i + 1, pageCount)
    }
    return streamZip(entries)
  },
}

export type PdfWorkerApi = typeof api

expose(api)
