/// <reference lib="webworker" />
import { expose } from 'comlink'
import { read, utils, type CellObject, type WorkBook } from 'xlsx'

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

const api = {
  /** Parse a workbook (XLSX/XLS/CSV/ODS); replaces any previously open one. */
  open(buffer: ArrayBuffer): SheetMeta[] {
    workbook = read(buffer, { dense: true })
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
}

export type SheetWorkerApi = typeof api

expose(api)
