/// <reference lib="webworker" />
import { expose } from 'comlink'
import { degrees, PDFDocument } from 'pdf-lib'
import type { PageState } from './pageOps'

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

const api = {
  /** Build a new PDF with the pages in `order`, applying each extra rotation. */
  async build(bytes: Uint8Array, order: PageState[]): Promise<Uint8Array> {
    const src = await PDFDocument.load(bytes)
    const out = await PDFDocument.create()
    const copied = await out.copyPages(
      src,
      order.map((p) => p.srcIndex),
    )
    copied.forEach((page, i) => {
      const extra = order[i].rotation
      if (extra !== 0) page.setRotation(degrees((page.getRotation().angle + extra) % 360))
      out.addPage(page)
    })
    copyMetadata(src, out)
    return out.save()
  },
}

export type OrganizeWorkerApi = typeof api

expose(api)
