import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { read, type CellObject, type WorkSheet } from 'xlsx'
import { cellValue, isDateFormat, isoDate } from './exportCell'
import expected from './fixtures/expected.json'

function fixture(name: string) {
  // Vitest runs from the repo root, so fixtures resolve from there.
  const path = resolve(process.cwd(), 'src/tools/xlsx-csv-viewer/fixtures', name)
  return read(new Uint8Array(readFileSync(path)), {
    dense: true,
    cellNF: true,
  })
}

function denseAt(sheet: WorkSheet, r: number, c: number): CellObject | undefined {
  const data = sheet['!data'] as (CellObject[] | undefined)[] | undefined
  return data?.[r]?.[c]
}

const typed = { date1904: false, values: 'typed' } as const
const display = { date1904: false, values: 'display' } as const

describe('isDateFormat', () => {
  it('recognises date and time formats', () => {
    expect(isDateFormat('yyyy-mm-dd')).toBe(true)
    expect(isDateFormat('m/d/yy h:mm')).toBe(true)
  })

  it('rejects number formats and missing formats', () => {
    expect(isDateFormat('"$"#,##0.00')).toBe(false)
    expect(isDateFormat('General')).toBe(false)
    expect(isDateFormat('0.0%')).toBe(false)
    expect(isDateFormat(undefined)).toBe(false)
    expect(isDateFormat('')).toBe(false)
  })
})

describe('isoDate', () => {
  it('uses a date-only shape for date formats', () => {
    expect(isoDate(45356, 'yyyy-mm-dd', false)).toBe('2024-03-05')
    expect(isoDate(25569, 'dd/mm/yyyy', false)).toBe('1970-01-01')
  })

  it('uses a full timestamp when the format has hour or second tokens', () => {
    expect(isoDate(45356.42743055556, 'm/d/yy h:mm', false)).toBe('2024-03-05T10:15:30')
    expect(isoDate(36526, 'm/d/yy h:mm', false)).toBe('2000-01-01T00:00:00')
    // Seconds are written even when the format hides them.
    expect(isoDate(45356.42743055556, 'yyyy-mm-dd hh:mm', false)).toBe('2024-03-05T10:15:30')
    expect(isoDate(45356.5, 'yyyy-mm-dd AM/PM', false)).toBe('2024-03-05T12:00:00')
  })

  it('uses a time-only shape when the format has no date tokens', () => {
    expect(isoDate(0.5, 'h:mm:ss', false)).toBe('12:00:00')
    expect(isoDate(0.25, 'hh:mm', false)).toBe('06:00:00')
  })

  it('ignores letters inside quoted literals and escapes', () => {
    // The "h" belongs to the literal, not to a token.
    expect(isoDate(45356, 'yyyy-mm-dd" hours"', false)).toBe('2024-03-05')
    expect(isoDate(45356, 'yyyy\\-mm\\-dd', false)).toBe('2024-03-05')
  })

  it('honours the 1904 date system', () => {
    expect(isoDate(43894, 'yyyy-mm-dd', true)).toBe('2024-03-05')
    expect(isoDate(43894, 'yyyy-mm-dd', false)).toBe('2020-03-04')
  })
})

describe('cellValue — hand-built cells', () => {
  it('maps empty, stub and blank-string cells to null', () => {
    expect(cellValue(undefined, typed)).toBeNull()
    expect(cellValue({ t: 'z' } as CellObject, typed)).toBeNull()
    expect(cellValue({ t: 's', v: '' }, typed)).toBeNull()
  })

  it('keeps text verbatim', () => {
    expect(cellValue({ t: 's', v: '007' }, typed)).toBe('007')
    expect(cellValue({ t: 's', v: ' pad ' }, typed)).toBe(' pad ')
    expect(cellValue({ t: 's', v: 'a\nb' }, typed)).toBe('a\nb')
  })

  it('maps booleans and errors', () => {
    expect(cellValue({ t: 'b', v: true }, typed)).toBe(true)
    expect(cellValue({ t: 'b', v: false }, typed)).toBe(false)
    expect(cellValue({ t: 'e', v: 7, w: '#DIV/0!' }, typed)).toBe('#DIV/0!')
    expect(cellValue({ t: 'e', v: 7 }, typed)).toBe('#ERROR')
  })

  it('normalises numbers', () => {
    expect(cellValue({ t: 'n', v: 1234.5, z: '"$"#,##0.00' }, typed)).toBe(1234.5)
    expect(cellValue({ t: 'n', v: -0 }, typed)).toBe(0)
    expect(Object.is(cellValue({ t: 'n', v: -0 }, typed), -0)).toBe(false)
    expect(cellValue({ t: 'n', v: Number.NaN }, typed)).toBeNull()
    expect(cellValue({ t: 'n', v: Number.POSITIVE_INFINITY }, typed)).toBeNull()
  })

  it('exports date-formatted numbers as ISO and bare serials as numbers', () => {
    expect(cellValue({ t: 'n', v: 45356, z: 'yyyy-mm-dd' }, typed)).toBe('2024-03-05')
    expect(cellValue({ t: 'n', v: 45356.5, z: 'General' }, typed)).toBe(45356.5)
    expect(cellValue({ t: 'n', v: 45356, z: 14 }, typed)).toBe('2024-03-05') // builtin m/d/yy
  })

  it('exports a cached formula value, never the formula', () => {
    expect(cellValue({ t: 'n', f: 'SUM(B2:B6)', v: 1001192.5, z: '"$"#,##0.00' }, typed)).toBe(
      1001192.5,
    )
    expect(cellValue({ t: 's', f: 'CONCATENATE(A2,"|",A3)', v: 'a|b' }, typed)).toBe('a|b')
  })

  it('handles real Date cells defensively', () => {
    expect(cellValue({ t: 'd', v: new Date(Date.UTC(2024, 2, 5)) }, typed)).toBe('2024-03-05')
    expect(cellValue({ t: 'd', v: new Date(Date.UTC(2024, 2, 5, 10, 15, 30)) }, typed)).toBe(
      '2024-03-05T10:15:30',
    )
  })

  it('display mode returns the formatted grid text', () => {
    expect(cellValue({ t: 'n', v: 1234.5, z: '"$"#,##0.00', w: '$1,234.50' }, display)).toBe(
      '$1,234.50',
    )
    expect(cellValue({ t: 'n', v: 0.125, z: '0.0%', w: '12.5%' }, display)).toBe('12.5%')
    expect(cellValue({ t: 'b', v: true }, display)).toBe('TRUE')
    expect(cellValue({ t: 's', v: '' }, display)).toBeNull()
  })
})

describe('cellValue — committed workbooks', () => {
  const wb = fixture('mixed.xlsx')
  const data = wb.Sheets.Data
  const oracle = expected['mixed.xlsx'].sheets.Data.rows

  it('reproduces every typed value of mixed.xlsx / Data', () => {
    for (let r = 0; r < oracle.length; r++) {
      for (let c = 0; c < 8; c++) {
        expect(cellValue(denseAt(data, r, c), typed), `r${r}c${c}`).toEqual(oracle[r][c])
      }
    }
  })

  it('reads the workbook date system from WBProps', () => {
    expect(wb.Workbook?.WBProps?.date1904 === true).toBe(false)
    const wb1904 = fixture('dates-1904.xlsx')
    expect(wb1904.Workbook?.WBProps?.date1904 === true).toBe(true)
    expect(
      cellValue(denseAt(wb1904.Sheets.Dates1904, 1, 0), { date1904: true, values: 'typed' }),
    ).toBe('2024-03-05')
  })

  it('display mode matches what the grid shows', () => {
    expect(cellValue(denseAt(data, 1, 1), display)).toBe('$1,234.50')
    expect(cellValue(denseAt(data, 1, 4), display)).toBe('3/5/24 10:15')
    expect(cellValue(denseAt(data, 6, 2), display)).toBe('#DIV/0!')
  })
})
