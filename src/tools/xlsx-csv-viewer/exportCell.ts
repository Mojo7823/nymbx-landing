import { SSF, utils, type CellObject } from 'xlsx'

/** A single exported cell: JSON-friendly, never a date serial. */
export type ExportValue = string | number | boolean | null

export interface CellValueOptions {
  /** Workbook date system — 1904 (old Mac Excel) shifts every serial by 1462 days. */
  date1904: boolean
  /** `typed` keeps numbers/booleans and turns dates into ISO strings; `display` is the grid text. */
  values: 'typed' | 'display'
}

const pad = (n: number, width = 2) => String(Math.trunc(Math.abs(n))).padStart(width, '0')

/**
 * Number-format string for a cell, resolving builtin format ids through the
 * SSF table. SheetJS only fills `z` when the workbook is read with
 * `cellNF: true` (the sheet worker does).
 */
function formatOf(cell: CellObject): string | undefined {
  const z = cell.z
  if (typeof z === 'string') return z
  if (typeof z === 'number') {
    const table = SSF.get_table() as Record<number, string | undefined>
    return table[z]
  }
  return undefined
}

/** Drop quoted literals and backslash escapes so their letters don't look like tokens. */
function stripLiterals(format: string): string {
  return format.replace(/"[^"]*"/g, '').replace(/\\[\s\S]/g, '')
}

/** True when the number format makes the cell a date/time rather than a plain number. */
export function isDateFormat(format: string | undefined): boolean {
  if (typeof format !== 'string' || format === '') return false
  try {
    return SSF.is_date(format)
  } catch {
    return false
  }
}

/**
 * Excel serial → ISO 8601. The shape follows the cell's number format so a
 * column stays uniform: time-only formats get `HH:MM:SS`, formats with an
 * hour/second/AM-PM token get `YYYY-MM-DDTHH:MM:SS` (naive — Excel times carry
 * no zone, and seconds are always written even when the format hides them),
 * everything else `YYYY-MM-DD`. Sub-second fractions are dropped.
 */
export function isoDate(serial: number, format: string | undefined, date1904: boolean): string {
  const parts = SSF.parse_date_code(serial, { date1904 }) as
    { y: number; m: number; d: number; H: number; M: number; S: number } | false | null | undefined
  if (!parts) return String(serial)
  const date = `${pad(parts.y, 4)}-${pad(parts.m)}-${pad(parts.d)}`
  const time = `${pad(parts.H)}:${pad(parts.M)}:${pad(parts.S)}`
  const tokens = stripLiterals(format ?? '')
  // Time-only first: a time format ("h:mm:ss") also matches the hour test, so
  // the absence of date tokens has to win.
  if (!/[yYdD]/.test(tokens)) return time
  if (/[hHsS]|AM\/PM|A\/P/.test(tokens)) return `${date}T${time}`
  return date
}

/** ISO string for a real `Date` — only reachable if a workbook is read with `cellDates`. */
function isoFromDate(value: Date): string {
  const date = `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
  const h = value.getUTCHours()
  const m = value.getUTCMinutes()
  const s = value.getUTCSeconds()
  if (h === 0 && m === 0 && s === 0) return date
  return `${date}T${pad(h)}:${pad(m)}:${pad(s)}`
}

/**
 * One dense-sheet cell → its export value. Formula cells export their cached
 * computed value (`v`/`w`); SheetJS never re-evaluates formulas, and `f` is
 * never exported.
 */
export function cellValue(cell: CellObject | undefined, opts: CellValueOptions): ExportValue {
  if (cell == null || cell.t === 'z') return null

  if (opts.values === 'display') {
    const text = utils.format_cell(cell)
    return text === '' ? null : text
  }

  switch (cell.t) {
    case 's': {
      const text = typeof cell.v === 'string' ? cell.v : String(cell.v ?? '')
      return text === '' ? null : text
    }
    case 'b':
      return Boolean(cell.v)
    case 'e':
      return cell.w ?? '#ERROR'
    case 'd':
      return cell.v instanceof Date ? isoFromDate(cell.v) : (cell.w ?? null)
    case 'n': {
      const v = cell.v
      if (typeof v !== 'number' || !Number.isFinite(v)) return null
      const format = formatOf(cell)
      if (isDateFormat(format)) return isoDate(v, format, opts.date1904)
      return Object.is(v, -0) ? 0 : v
    }
    default:
      return null
  }
}
