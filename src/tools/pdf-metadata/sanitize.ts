import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRef,
  PDFString,
  type PDFContext,
} from 'pdf-lib'
import { nestedCarrierDicts } from './carriers'
import { hasSignature, infoDict } from './inspect'
import { formatPdfDate, parsePdfDate } from './pdfDate'
import { removeUnreachable } from './reachability'
import { buildXmp, type XmpFields } from './xmp'
import type { Changes, Report } from './types'

const DATE_KEYS = new Set(['CreationDate', 'ModDate'])
const TRAPPED_VALUES = new Set(['True', 'False', 'Unknown'])

/** Create the Info dictionary if the file has none, and return it. */
function ensureInfoDict(doc: PDFDocument): PDFDict {
  const existing = infoDict(doc)
  if (existing) return existing
  const dict = doc.context.obj({})
  doc.context.trailerInfo.Info = doc.context.register(dict)
  return dict
}

/**
 * Drop the Info dictionary entirely. No metadata setter may run afterwards:
 * every one of them re-creates the dictionary.
 */
function removeInfoDict(doc: PDFDocument): boolean {
  const ref = doc.context.trailerInfo.Info as unknown
  if (ref === undefined) return false
  delete doc.context.trailerInfo.Info
  if (ref instanceof PDFRef) doc.context.delete(ref)
  return true
}

/** Delete a dictionary key, and the object behind it when it is indirect. */
function deleteEntry(context: PDFContext, dict: PDFDict, key: string): boolean {
  const name = PDFName.of(key)
  const value = dict.get(name)
  if (value === undefined) return false
  dict.delete(name)
  if (value instanceof PDFRef) context.delete(value)
  return true
}

function randomHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The Info values the resulting document has, as XMP field names. */
function xmpFieldsFromInfo(dict: PDFDict | undefined): XmpFields {
  if (!dict) return {}
  const read = (key: string) => {
    const value = dict.get(PDFName.of(key))
    if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText()
    return undefined
  }
  const isoDate = (key: string) => {
    const raw = read(key)
    if (!raw) return undefined
    const date = parsePdfDate(raw)
    return date ? date.toISOString().replace(/\.\d{3}Z$/, 'Z') : undefined
  }
  return {
    title: read('Title'),
    author: read('Author'),
    subject: read('Subject'),
    keywords: read('Keywords'),
    producer: read('Producer'),
    creatorTool: read('Creator'),
    createDate: isoDate('CreationDate'),
    modifyDate: isoDate('ModDate'),
  }
}

/**
 * Re-load the original bytes and apply `changes`. The caller keeps the
 * original, so every apply starts from the untouched file — the tool never
 * stacks edits on top of an already-rewritten document.
 *
 * `updateMetadata: false` on both load and save is essential: the pdf-lib
 * default stamps its own Producer/Creator/ModDate, the opposite of what a
 * sanitizer must do.
 */
export async function applyChanges(
  bytes: Uint8Array,
  changes: Changes,
): Promise<{ bytes: Uint8Array; report: Report }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const signature = hasSignature(doc)

  const report: Report = {
    before: bytes.length,
    after: 0,
    infoSet: [],
    infoRemoved: [],
    infoDictRemoved: false,
    xmp: 'none',
    extraXmpRemoved: 0,
    pieceInfoRemoved: 0,
    idReset: false,
    signatureInvalidated: signature,
    orphansRemoved: 0,
  }

  // 1. Info dictionary.
  if (changes.info === 'remove') {
    report.infoDictRemoved = removeInfoDict(doc)
  } else {
    const { set, remove } = changes.info
    const wanted = Object.entries(set).filter(([, value]) => value.trim() !== '')
    const dropped = [...remove, ...Object.keys(set).filter((key) => set[key].trim() === '')]
    const existing = infoDict(doc)
    if (wanted.length > 0 || existing) {
      const dict = wanted.length > 0 ? ensureInfoDict(doc) : existing!
      for (const [key, value] of wanted) {
        if (DATE_KEYS.has(key)) {
          const date = new Date(value)
          dict.set(
            PDFName.of(key),
            Number.isNaN(date.getTime())
              ? PDFHexString.fromText(value)
              : PDFString.of(formatPdfDate(date)),
          )
        } else if (key === 'Trapped' && TRAPPED_VALUES.has(value)) {
          // /Trapped is a name object, not a string (PDF 32000-1 §14.11.3).
          dict.set(PDFName.of(key), PDFName.of(value))
        } else {
          dict.set(PDFName.of(key), PDFHexString.fromText(value))
        }
        report.infoSet.push(key)
      }
      for (const key of dropped) {
        if (deleteEntry(doc.context, dict, key)) report.infoRemoved.push(key)
      }
    }
  }

  // 2. Catalog XMP packet.
  const metadataName = PDFName.of('Metadata')
  const currentMetadata = doc.catalog.get(metadataName)
  if (changes.xmp === 'remove') {
    if (currentMetadata) {
      doc.catalog.delete(metadataName)
      if (currentMetadata instanceof PDFRef) doc.context.delete(currentMetadata)
      report.xmp = 'removed'
    }
  } else if (changes.xmp === 'regenerate') {
    const xml = buildXmp(xmpFieldsFromInfo(infoDict(doc)))
    if (xml === null) {
      if (currentMetadata) {
        doc.catalog.delete(metadataName)
        if (currentMetadata instanceof PDFRef) doc.context.delete(currentMetadata)
        report.xmp = 'removed'
      }
    } else {
      // Uncompressed on purpose: the XMP spec wants the packet findable by a
      // scanner that does not parse the PDF.
      // Re-wrapped: pdf-lib checks `instanceof Uint8Array`, and jsdom's
      // TextEncoder returns an array from another realm.
      const packet = new Uint8Array(new TextEncoder().encode(xml))
      const stream = doc.context.stream(packet, {
        Type: 'Metadata',
        Subtype: 'XML',
      })
      doc.catalog.set(metadataName, doc.context.register(stream))
      if (currentMetadata instanceof PDFRef) doc.context.delete(currentMetadata)
      report.xmp = currentMetadata ? 'regenerated' : 'created'
    }
  } else if (currentMetadata) {
    report.xmp = 'kept'
  }

  // 3./4. Page and XObject /Metadata and /PieceInfo, plus catalog /PieceInfo.
  if (changes.pieceInfo && deleteEntry(doc.context, doc.catalog, 'PieceInfo')) {
    report.pieceInfoRemoved++
  }
  if (changes.extraXmp || changes.pieceInfo) {
    for (const dict of nestedCarrierDicts(doc)) {
      if (changes.extraXmp && deleteEntry(doc.context, dict, 'Metadata')) report.extraXmpRemoved++
      if (changes.pieceInfo && deleteEntry(doc.context, dict, 'PieceInfo'))
        report.pieceInfoRemoved++
    }
  }

  // 5. Document ID.
  if (changes.resetId) {
    doc.context.trailerInfo.ID = doc.context.obj([
      PDFHexString.of(randomHex()),
      PDFHexString.of(randomHex()),
    ])
    report.idReset = true
  }

  // 6. Objects nothing points to any more. pdf-lib would write them back —
  // that is how an earlier revision's Info dictionary outlives "strip all".
  report.orphansRemoved = removeUnreachable(doc.context)

  // `save()` has no `updateMetadata` option in pdf-lib 1.17 — the Producer /
  // Creator / ModDate stamping happens in the constructor, which the
  // `updateMetadata: false` on `load()` above already suppressed. Form field
  // appearances are left alone: this tool must not redraw anything.
  const out = await doc.save({ updateFieldAppearances: false })
  report.after = out.length
  return { bytes: out, report }
}
