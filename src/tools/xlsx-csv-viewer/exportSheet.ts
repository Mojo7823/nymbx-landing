import { utils, type CellObject, type WorkSheet } from 'xlsx'
import { colLabel } from './gridMath'
import { cellValue, type ExportValue } from './exportCell'
import { type ExportOptions } from './exportOptions'

// Re-exported so the worker and the tests have one import for the whole
// export surface; the option types themselves stay SheetJS-free.
export type { ExportValue }
export * from './exportOptions'

function cellAt(sheet: WorkSheet, r: number, c: number): CellObject | undefined {
  const dense = sheet['!data'] as (CellObject[] | undefined)[] | undefined
  if (dense) return dense[r]?.[c]
  return sheet[utils.encode_cell({ r, c })] as CellObject | undefined
}

/**
 * Sheet → rectangular table of export values. Every row is padded to the sheet
 * width taken from `!ref`; empty cells are `null`. Hidden row/column flags are
 * ignored (Excel's own "Save as CSV" exports them too), and trailing empty
 * rows/columns are outside `!ref` and therefore not exported.
 */
export function extractTable(
  sheet: WorkSheet,
  date1904: boolean,
  opts: Pick<ExportOptions, 'format' | 'values' | 'rowIndices'>,
): ExportValue[][] {
  const ref = sheet['!ref']
  if (!ref) return []
  const range = utils.decode_range(ref)
  const width = range.e.c + 1
  const height = range.e.r + 1
  if (width <= 0 || height <= 0) return []

  let indices = opts.rowIndices
  if (indices && opts.format === 'json-objects') {
    // Object keys come from the header, so sheet row 0 leads the table even
    // when the view sorted it elsewhere or filtered it out.
    indices = [0, ...indices.filter((i) => i !== 0)]
  }
  indices ??= Array.from({ length: height }, (_, i) => i)

  const cellOpts = { date1904, values: opts.values }
  return indices.map((r) => {
    const row: ExportValue[] = new Array<ExportValue>(width)
    for (let c = 0; c < width; c++) row[c] = cellValue(cellAt(sheet, r, c), cellOpts)
    return row
  })
}

function csvField(value: ExportValue, delimiter: string, quoteAll: boolean): string {
  let text: string
  if (value === null) text = ''
  else if (typeof value === 'boolean') text = value ? 'TRUE' : 'FALSE'
  else if (typeof value === 'number') text = String(value)
  else text = value

  const needsQuotes =
    quoteAll ||
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes('\r') ||
    text.includes('\n')
  return needsQuotes ? `"${text.replaceAll('"', '""')}"` : text
}

/** RFC 4180 CSV: CRLF records with a trailing CRLF, doubled quotes, `null` → empty. */
export function toCsv(
  table: ExportValue[][],
  opts: Pick<ExportOptions, 'delimiter' | 'quoteAll'>,
): string {
  if (table.length === 0) return ''
  const { delimiter, quoteAll } = opts
  let out = ''
  for (const row of table) {
    for (let c = 0; c < row.length; c++) {
      if (c > 0) out += delimiter
      out += csvField(row[c], delimiter, quoteAll)
    }
    out += '\r\n'
  }
  return out
}

/**
 * Object keys for the first table row: trimmed header text, the column letter
 * for an empty header, and `_2`, `_3`… for duplicates.
 */
export function headerKeys(headerRow: ExportValue[]): string[] {
  const used = new Set<string>()
  return headerRow.map((value, c) => {
    const base = (value === null ? '' : String(value).trim()) || colLabel(c)
    let key = base
    let n = 1
    while (used.has(key)) key = `${base}_${++n}`
    used.add(key)
    return key
  })
}

/** Table → JSON text. `objects` keys rows by the header row and skips all-empty rows. */
export function toJson(table: ExportValue[][], mode: 'objects' | 'arrays'): string {
  if (mode === 'arrays') return JSON.stringify(table, null, 2)
  if (table.length === 0) return JSON.stringify([], null, 2)
  const keys = headerKeys(table[0])
  const rows = table
    .slice(1)
    .filter((row) => row.some((v) => v !== null))
    .map((row) => {
      const out: Record<string, ExportValue> = {}
      keys.forEach((key, c) => {
        out[key] = row[c] ?? null
      })
      return out
    })
  return JSON.stringify(rows, null, 2)
}

/** Serialise a table in the requested format. */
export function serializeTable(table: ExportValue[][], opts: ExportOptions): string {
  if (opts.format === 'csv') return toCsv(table, opts)
  return toJson(table, opts.format === 'json-objects' ? 'objects' : 'arrays')
}

/** UTF-8 bytes for exported text, with the optional CSV byte-order mark. */
export function encodeExport(text: string, withBom: boolean): Uint8Array {
  const body = new TextEncoder().encode(text)
  if (!withBom) return body
  const out = new Uint8Array(body.length + 3)
  out.set([0xef, 0xbb, 0xbf], 0)
  out.set(body, 3)
  return out
}
