/**
 * Shapes shared between the worker (pdf-lib) and the page. Kept free of
 * `pdf-lib` imports so the page chunk never pulls the parser in.
 */

/** Info-dictionary keys the PDF spec defines, in the order they are shown. */
export const STANDARD_INFO_KEYS = [
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
  'Trapped',
] as const

export type StandardInfoKey = (typeof STANDARD_INFO_KEYS)[number]

export interface InfoEntry {
  key: string
  value: string
  kind: 'text' | 'date' | 'other'
  standard: boolean
}

export interface Summary {
  pages: number
  bytes: number
  /** `null` when the file has no Info dictionary at all. */
  info: InfoEntry[] | null
  /** Catalog XMP packet as text, BOM stripped; `null` when absent. */
  xmp: string | null
  /** Decoded size of the packet, for display. */
  xmpBytes: number
  /** `/Metadata` streams on pages and XObjects. */
  extraXmp: number
  /** `/PieceInfo` entries on the catalog, pages and XObjects. */
  pieceInfo: number
  /** The two halves of the trailer `/ID`, as hex. */
  id: [string, string] | null
  hasSignature: boolean
  attachments: number
  /** Indirect objects nothing references — leftovers of earlier revisions. */
  orphans: number
}

export interface InfoChanges {
  /** Values to write. A `''` value removes the key. Dates are ISO strings. */
  set: Record<string, string>
  /** Keys to delete. */
  remove: string[]
}

export interface Changes {
  info: 'remove' | InfoChanges
  xmp: 'keep' | 'remove' | 'regenerate'
  /** Remove `/Metadata` streams on pages and XObjects. */
  extraXmp: boolean
  /** Remove every `/PieceInfo`. */
  pieceInfo: boolean
  /** Replace `/ID` with two random 16-byte strings (also when there was none). */
  resetId: boolean
}

export interface Report {
  before: number
  after: number
  infoSet: string[]
  infoRemoved: string[]
  infoDictRemoved: boolean
  xmp: 'kept' | 'removed' | 'regenerated' | 'created' | 'none'
  extraXmpRemoved: number
  pieceInfoRemoved: number
  idReset: boolean
  signatureInvalidated: boolean
  /** Unreferenced objects (earlier revisions) dropped from the output. */
  orphansRemoved: number
}
