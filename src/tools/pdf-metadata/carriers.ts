import { PDFDict, PDFName, PDFRef, PDFStream, type PDFContext, type PDFDocument } from 'pdf-lib'

/**
 * Metadata rides on more than the Info dictionary: pages and (form) XObjects
 * can each carry their own `/Metadata` XMP stream and `/PieceInfo` private
 * application data. Both the reader and the sanitizer walk the same set of
 * dictionaries, so the walk lives here.
 */

function collectXObjects(context: PDFContext, dict: PDFDict, seen: Set<string>, out: PDFDict[]) {
  const resources = context.lookupMaybe(dict.get(PDFName.of('Resources')), PDFDict)
  if (!resources) return
  const xObjects = context.lookupMaybe(resources.get(PDFName.of('XObject')), PDFDict)
  if (!xObjects) return
  for (const [, value] of xObjects.entries()) {
    if (value instanceof PDFRef) {
      const key = value.toString()
      if (seen.has(key)) continue
      seen.add(key)
    }
    const stream = context.lookupMaybe(value, PDFStream)
    if (!stream) continue
    out.push(stream.dict)
    // Form XObjects have their own /Resources and can nest further.
    collectXObjects(context, stream.dict, seen, out)
  }
}

/**
 * Every page node and XObject dictionary of the document, each visited once
 * even when several pages share the same object.
 */
export function nestedCarrierDicts(doc: PDFDocument): PDFDict[] {
  const out: PDFDict[] = []
  const seen = new Set<string>()
  for (const page of doc.getPages()) {
    out.push(page.node)
    collectXObjects(doc.context, page.node, seen, out)
  }
  return out
}

/** Look up the `/Metadata` value of a dictionary as a stream, if it has one. */
export function metadataStream(context: PDFContext, dict: PDFDict) {
  const value = dict.get(PDFName.of('Metadata'))
  if (!value) return null
  return context.lookupMaybe(value, PDFStream)
}
