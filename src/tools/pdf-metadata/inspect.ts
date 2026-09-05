import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFStream,
  PDFString,
  type PDFContext,
  type PDFDocument,
} from 'pdf-lib'
import { metadataStream, nestedCarrierDicts } from './carriers'
import { looksLikePdfDate } from './pdfDate'
import { unreachableRefs } from './reachability'
import { STANDARD_INFO_KEYS, type InfoEntry, type Summary } from './types'

/** The Info dictionary, or `undefined` when the file has none. */
export function infoDict(doc: PDFDocument): PDFDict | undefined {
  return doc.context.lookupMaybe(doc.context.trailerInfo.Info, PDFDict)
}

/** Text of a `/Metadata` stream, filters undone, BOM stripped. */
export function decodeXmp(stream: PDFStream): string {
  const bytes =
    stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents()
  return new TextDecoder().decode(bytes).replace(/^\uFEFF/, '')
}

function readInfo(dict: PDFDict): InfoEntry[] {
  const entries: InfoEntry[] = []
  for (const [name, value] of dict.entries()) {
    const key = name.decodeText()
    if (value instanceof PDFString || value instanceof PDFHexString) {
      const text = value.decodeText()
      const isDate =
        key === 'CreationDate' || key === 'ModDate'
          ? true
          : looksLikePdfDate(text) && /^D:/.test(text)
      entries.push({
        key,
        value: text,
        kind: isDate ? 'date' : 'text',
        standard: (STANDARD_INFO_KEYS as readonly string[]).includes(key),
      })
    } else {
      entries.push({
        key,
        value: value.toString(),
        kind: 'other',
        standard: (STANDARD_INFO_KEYS as readonly string[]).includes(key),
      })
    }
  }
  // Standard keys first, in spec order; everything else keeps dictionary order.
  const order = (entry: InfoEntry) => {
    const index = (STANDARD_INFO_KEYS as readonly string[]).indexOf(entry.key)
    return index === -1 ? STANDARD_INFO_KEYS.length : index
  }
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => order(a.entry) - order(b.entry) || a.index - b.index)
    .map(({ entry }) => entry)
}

function readId(context: PDFContext): [string, string] | null {
  const array = context.lookupMaybe(context.trailerInfo.ID, PDFArray)
  if (!array || array.size() < 2) return null
  const half = (index: number) => {
    const value = array.lookup(index)
    if (value instanceof PDFHexString) return value.asString()
    if (value instanceof PDFString) {
      return Array.from(new TextEncoder().encode(value.asString()), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('')
    }
    return ''
  }
  return [half(0), half(1)]
}

/** Signature fields make any rewrite invalidate the signature — detect them. */
export function hasSignature(doc: PDFDocument): boolean {
  const acroForm = doc.context.lookupMaybe(doc.catalog.get(PDFName.of('AcroForm')), PDFDict)
  if (acroForm) {
    const flags = doc.context.lookupMaybe(acroForm.get(PDFName.of('SigFlags')), PDFNumber)
    if (flags && (flags.asNumber() & 1) === 1) return true
    const fields = doc.context.lookupMaybe(acroForm.get(PDFName.of('Fields')), PDFArray)
    if (fields && anyFieldIsSignature(doc.context, fields)) return true
  }
  for (const page of doc.getPages()) {
    const annots = doc.context.lookupMaybe(page.node.get(PDFName.of('Annots')), PDFArray)
    if (annots && anyFieldIsSignature(doc.context, annots)) return true
  }
  return false
}

function anyFieldIsSignature(context: PDFContext, array: PDFArray): boolean {
  for (let i = 0; i < array.size(); i++) {
    const dict = context.lookupMaybe(array.get(i), PDFDict)
    if (!dict) continue
    const type = dict.get(PDFName.of('FT'))
    if (type instanceof PDFName && type.asString() === '/Sig') return true
  }
  return false
}

function countAttachments(doc: PDFDocument): number {
  const names = doc.context.lookupMaybe(doc.catalog.get(PDFName.of('Names')), PDFDict)
  const root = names && doc.context.lookupMaybe(names.get(PDFName.of('EmbeddedFiles')), PDFDict)
  if (!root) return 0
  const count = (node: PDFDict): number => {
    let total = 0
    const entries = doc.context.lookupMaybe(node.get(PDFName.of('Names')), PDFArray)
    if (entries) total += Math.floor(entries.size() / 2)
    const kids = doc.context.lookupMaybe(node.get(PDFName.of('Kids')), PDFArray)
    if (kids) {
      for (let i = 0; i < kids.size(); i++) {
        const kid = doc.context.lookupMaybe(kids.get(i), PDFDict)
        if (kid) total += count(kid)
      }
    }
    return total
  }
  return count(root)
}

/** Everything the tool shows about a document, read with pdf-lib only. */
export function summarize(doc: PDFDocument, bytes: Uint8Array): Summary {
  const info = infoDict(doc)
  const catalogXmp = metadataStream(doc.context, doc.catalog)
  const xmp = catalogXmp ? decodeXmp(catalogXmp) : null

  let extraXmp = 0
  let pieceInfo = doc.catalog.has(PDFName.of('PieceInfo')) ? 1 : 0
  for (const dict of nestedCarrierDicts(doc)) {
    if (dict.has(PDFName.of('Metadata'))) extraXmp++
    if (dict.has(PDFName.of('PieceInfo'))) pieceInfo++
  }

  return {
    pages: doc.getPageCount(),
    bytes: bytes.length,
    info: info ? readInfo(info) : null,
    xmp,
    xmpBytes: xmp === null ? 0 : new TextEncoder().encode(xmp).length,
    extraXmp,
    pieceInfo,
    id: readId(doc.context),
    hasSignature: hasSignature(doc),
    attachments: countAttachments(doc),
    orphans: unreachableRefs(doc.context).length,
  }
}
