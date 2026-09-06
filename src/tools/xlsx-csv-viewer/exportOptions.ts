/**
 * Export options and file naming — deliberately free of any `xlsx` import so
 * the page and the export panel can use them without pulling SheetJS (~900 kB)
 * out of the worker chunk and into the route chunk. Everything that touches a
 * WorkSheet lives in `exportSheet.ts`, which only the worker and tests import.
 */

export type ExportFormat = 'csv' | 'json-objects' | 'json-arrays'
export type CsvDelimiter = ',' | ';' | '\t' | '|'

export interface ExportOptions {
  format: ExportFormat
  /** `typed` (default) keeps numbers/booleans/ISO dates; `display` exports the grid text. */
  values: 'typed' | 'display'
  /** CSV only. */
  delimiter: CsvDelimiter
  /** CSV only — quote every field, not just the ambiguous ones. */
  quoteAll: boolean
  /** CSV only — prepend `EF BB BF` so Excel reads UTF-8 accents and CJK. */
  bom: boolean
  /**
   * "Current view": sheet row indices in display order (sorted/filtered as the
   * grid shows them). Undefined exports the whole sheet.
   */
  rowIndices?: number[]
}

export const defaultExportOptions: ExportOptions = {
  format: 'csv',
  values: 'typed',
  delimiter: ',',
  quoteAll: false,
  bom: true,
}

/** Characters Windows, macOS or a zip entry cannot take (plus `&`, awkward in shells). */
function isIllegalInFileName(ch: string): boolean {
  return '\\/:*?"<>|&'.includes(ch) || (ch.codePointAt(0) ?? 0) < 0x20
}

/**
 * Sheet name → a file name that is safe on every OS. `taken` is consulted
 * case-insensitively and **mutated** with the returned name so a caller can
 * loop over a workbook's sheets.
 */
export function safeSheetFileName(name: string, taken: Set<string>): string {
  let safe = Array.from(name, (ch) => (isIllegalInFileName(ch) ? '_' : ch))
    .join('')
    // Collapse only runs of the *same* character, so "_ _ _" survives as written.
    .replace(/_{2,}/g, '_')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, 80)
    .trim()
  if (safe === '' || safe === '.' || safe === '..') safe = 'Sheet'
  let candidate = safe
  let n = 1
  while (taken.has(candidate.toLowerCase())) candidate = `${safe} (${++n})`
  taken.add(candidate.toLowerCase())
  return candidate
}

/** File name without its extension — the stem every export name is built on. */
export function fileStem(fileName: string): string {
  const cut = fileName.lastIndexOf('.')
  const stem = cut > 0 ? fileName.slice(0, cut) : fileName
  return stem.trim() === '' ? 'workbook' : stem
}
