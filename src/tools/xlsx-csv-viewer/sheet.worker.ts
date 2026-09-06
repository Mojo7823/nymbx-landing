/// <reference lib="webworker" />
import { expose, transfer } from 'comlink'
import { read, utils, type CellObject, type WorkBook } from 'xlsx'
import { createZip } from '../../lib/download'
import {
  encodeExport,
  extractTable,
  safeSheetFileName,
  serializeTable,
  type ExportOptions,
} from './exportSheet'

export interface SheetMeta {
  name: string
  rows: number
  cols: number
}

let workbook: WorkBook | null = null

function denseData(sheetName: string): (CellObject[] | undefined)[] {
  if (!workbook) throw new Error('no workbook open')
  const sheet = workbook.Sheets[sheetName]
  return (sheet?.['!data'] ?? []) as (CellObject[] | undefined)[]
}

function requireSheet(index: number) {
  if (!workbook) throw new Error('no workbook open')
  const sheet = workbook.Sheets[workbook.SheetNames[index]]
  if (!sheet) throw new Error(`no sheet at index ${index}`)
  return sheet
}

/** 1904 date system (old Mac Excel): every serial is 1462 days off the 1900 one. */
function date1904(): boolean {
  return workbook?.Workbook?.WBProps?.date1904 === true
}

const api = {
  /** Parse a workbook (XLSX/XLS/CSV/ODS); replaces any previously open one. */
  open(buffer: ArrayBuffer): SheetMeta[] {
    // cellNF keeps each cell's number format in `z` — the export needs it to
    // tell a date-formatted number from a bare serial.
    workbook = read(buffer, { dense: true, cellNF: true })
    return workbook.SheetNames.map((name) => {
      const data = denseData(name)
      let cols = 0
      for (const row of data) if (row && row.length > cols) cols = row.length
      return { name, rows: data.length, cols }
    })
  },

  /**
   * Formatted display text for every cell of one sheet. Formula cells format
   * their cached computed value — SheetJS does not re-evaluate formulas.
   */
  getSheet(index: number): string[][] {
    if (!workbook) throw new Error('no workbook open')
    const data = denseData(workbook.SheetNames[index])
    return data.map((row) =>
      (row ?? []).map((cell) => (cell == null ? '' : utils.format_cell(cell))),
    )
  },

  /** One sheet as CSV or JSON bytes, ready to be wrapped in a Blob. */
  exportSheet(index: number, opts: ExportOptions): Uint8Array {
    const sheet = requireSheet(index)
    const text = serializeTable(extractTable(sheet, date1904(), opts), opts)
    const bytes = encodeExport(text, opts.format === 'csv' && opts.bom)
    return transfer(bytes, [bytes.buffer])
  },

  /** Every sheet as a CSV inside one zip, `<stem>/<safe sheet name>.csv`. */
  async exportAllCsv(
    opts: Omit<ExportOptions, 'format' | 'rowIndices'>,
    stem: string,
  ): Promise<Uint8Array> {
    if (!workbook) throw new Error('no workbook open')
    const csvOpts: ExportOptions = { ...opts, format: 'csv' }
    const taken = new Set<string>()
    const folder = safeSheetFileName(stem, new Set())
    const files = workbook.SheetNames.map((name, index) => {
      const text = serializeTable(extractTable(requireSheet(index), date1904(), csvOpts), csvOpts)
      return {
        name: `${folder}/${safeSheetFileName(name, taken)}.csv`,
        data: encodeExport(text, csvOpts.bom),
      }
    })
    const zipped = await createZip(files)
    const bytes = new Uint8Array(zipped)
    return transfer(bytes, [bytes.buffer])
  },
}

export type SheetWorkerApi = typeof api

expose(api)
