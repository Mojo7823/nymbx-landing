import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { read, type WorkBook } from 'xlsx'
import {
  defaultExportOptions,
  encodeExport,
  extractTable,
  headerKeys,
  safeSheetFileName,
  serializeTable,
  toCsv,
  toJson,
  type ExportOptions,
  type ExportValue,
} from './exportSheet'
import expected from './fixtures/expected.json'

// Vitest runs from the repo root, so fixtures resolve from there.
function fixture(name: string): WorkBook {
  const path = resolve(process.cwd(), 'src/tools/xlsx-csv-viewer/fixtures', name)
  return read(new Uint8Array(readFileSync(path)), { dense: true, cellNF: true })
}

function opts(over: Partial<ExportOptions> = {}): ExportOptions {
  return { ...defaultExportOptions, ...over }
}

const mixed = fixture('mixed.xlsx')
const data = mixed.Sheets.Data
const oracle = expected['mixed.xlsx'].sheets.Data.rows as ExportValue[][]

describe('extractTable', () => {
  it('matches the openpyxl oracle for mixed.xlsx / Data', () => {
    expect(extractTable(data, false, opts())).toEqual(oracle)
  })

  it('pads every row to the !ref width and keeps the blank row', () => {
    const table = extractTable(data, false, opts())
    expect(table).toHaveLength(7)
    for (const row of table) expect(row).toHaveLength(8)
    expect(table[4]).toEqual(Array<null>(8).fill(null))
  })

  it('returns an empty table for a sheet with no cells', () => {
    expect(extractTable(mixed.Sheets.Empty, false, opts())).toEqual([])
  })

  it('reads the small sheet with the awkward name', () => {
    const sheet = mixed.Sheets['Q3 Sales "east" & <west>']
    expect(extractTable(sheet, false, opts())).toEqual([
      ['only', 'one'],
      ['row', 2],
    ])
  })

  it('honours the 1904 date system', () => {
    const wb = fixture('dates-1904.xlsx')
    expect(extractTable(wb.Sheets.Dates1904, true, opts())).toEqual([['When'], ['2024-03-05']])
    // With the wrong flag the same serial lands four years earlier.
    expect(extractTable(wb.Sheets.Dates1904, false, opts())[1][0]).toBe('2020-03-04')
  })

  it('display mode exports the formatted grid text', () => {
    const table = extractTable(data, false, opts({ values: 'display' }))
    expect(table[1]).toEqual([
      'Alice, "the" first',
      '$1,234.50',
      '12.5%',
      '2024-03-05',
      '3/5/24 10:15',
      'TRUE',
      'line one\nline two',
      '007',
    ])
  })

  it('exports exactly the view rows, in display order', () => {
    const table = extractTable(data, false, opts({ rowIndices: [6, 2] }))
    expect(table).toHaveLength(2)
    expect(table[0][0]).toBe('Alice, "the" first|Bob')
    expect(table[1][0]).toBe('Bob')
  })

  it('always leads with sheet row 0 in json-objects view mode', () => {
    const table = extractTable(data, false, opts({ format: 'json-objects', rowIndices: [6, 2] }))
    expect(table.map((r) => r[0])).toEqual(['Name', 'Alice, "the" first|Bob', 'Bob'])
    // Row 0 is not duplicated when the view already contains it.
    const withHeader = extractTable(
      data,
      false,
      opts({ format: 'json-objects', rowIndices: [2, 0] }),
    )
    expect(withHeader.map((r) => r[0])).toEqual(['Name', 'Bob'])
  })
})

describe('toCsv', () => {
  const csvOpts = { delimiter: ',' as const, quoteAll: false }

  it('joins records with CRLF and ends with one', () => {
    expect(toCsv([['a', 'b'], ['c']], csvOpts)).toBe('a,b\r\nc\r\n')
    expect(toCsv([], csvOpts)).toBe('')
  })

  it('quotes only fields that need it', () => {
    const table: ExportValue[][] = [
      ['plain', 'has,comma', 'has"quote', 'line\nbreak', 'cr\rreturn', ' padded ', 'tab\there'],
    ]
    expect(toCsv(table, csvOpts)).toBe(
      'plain,"has,comma","has""quote","line\nbreak","cr\rreturn", padded ,tab\there\r\n',
    )
  })

  it('renders null, booleans and numbers Excel-style', () => {
    expect(toCsv([[null, true, false, 1234.5, 1e6, 0.125, -42, 0]], csvOpts)).toBe(
      ',TRUE,FALSE,1234.5,1000000,0.125,-42,0\r\n',
    )
  })

  it('quotes by the chosen delimiter', () => {
    const table: ExportValue[][] = [['a,b', 'c;d', 'e\tf', 'g|h']]
    // Only the active delimiter forces quoting, so "a,b" rides along unquoted.
    expect(toCsv(table, { delimiter: ';', quoteAll: false })).toBe('a,b;"c;d";e\tf;g|h\r\n')
    expect(toCsv(table, { delimiter: '\t', quoteAll: false })).toBe('a,b\tc;d\t"e\tf"\tg|h\r\n')
    expect(toCsv(table, { delimiter: '|', quoteAll: false })).toBe('a,b|c;d|e\tf|"g|h"\r\n')
  })

  it('quoteAll quotes every field including empties', () => {
    expect(toCsv([['a', null, 1]], { delimiter: ',', quoteAll: true })).toBe('"a","","1"\r\n')
  })

  it('produces the specified CSV for mixed.xlsx', () => {
    const text = toCsv(extractTable(data, false, opts()), csvOpts)
    const records = text.split('\r\n')
    expect(records).toHaveLength(8) // 7 records + the trailing empty string
    expect(records[7]).toBe('')
    expect(records[4]).toBe(',,,,,,,') // the blank row survives as empty fields
    expect(text).toContain('"Alice, ""the"" first"')
    expect(text).toContain('"line one\nline two"')
    expect(text).toContain('tab\there')
    expect(text).toContain(' leading and trailing ')
    expect(text).not.toContain('SUM(')
    expect(text).not.toContain('CONCATENATE')
    expect(text).toContain('#DIV/0!')
    expect(text).toContain('45356.5')
  })
})

describe('headerKeys', () => {
  it('trims header text and falls back to the column letter', () => {
    expect(headerKeys(['Name', '  Amount  ', null, 3])).toEqual(['Name', 'Amount', 'C', '3'])
  })

  it('suffixes duplicates', () => {
    expect(headerKeys(['Amount', 'Amount', 'Amount'])).toEqual(['Amount', 'Amount_2', 'Amount_3'])
  })

  it('does not collide with an existing suffixed header', () => {
    expect(headerKeys(['a', 'a_2', 'a'])).toEqual(['a', 'a_2', 'a_3'])
  })
})

describe('toJson', () => {
  const table = extractTable(data, false, opts({ format: 'json-objects' }))

  it('objects mode keys rows by the header and skips all-empty rows', () => {
    const rows = JSON.parse(toJson(table, 'objects')) as Record<string, ExportValue>[]
    expect(rows).toHaveLength(5)
    expect(Object.keys(rows[0])).toEqual([
      'Name',
      'Amount',
      'Ratio',
      'When',
      'Stamp',
      'Flag',
      'Notes',
      'Code',
    ])
    expect(rows[0]).toEqual({
      Name: 'Alice, "the" first',
      Amount: 1234.5,
      Ratio: 0.125,
      When: '2024-03-05',
      Stamp: '2024-03-05T10:15:30',
      Flag: true,
      Notes: 'line one\nline two',
      Code: '007',
    })
    expect(rows[4]).toMatchObject({ Ratio: '#DIV/0!', Stamp: 45356.5, Flag: true, Code: null })
  })

  it('arrays mode keeps the header and the blank row', () => {
    const rows = JSON.parse(toJson(table, 'arrays')) as ExportValue[][]
    expect(rows).toHaveLength(7)
    expect(rows[0][0]).toBe('Name')
    expect(rows[4]).toEqual(Array<null>(8).fill(null))
  })

  it('renders an empty sheet as []', () => {
    expect(JSON.parse(toJson([], 'objects'))).toEqual([])
    expect(JSON.parse(toJson([], 'arrays'))).toEqual([])
  })
})

describe('safeSheetFileName', () => {
  it('replaces characters that are illegal in file names', () => {
    expect(safeSheetFileName('Q3 Sales "east" & <west>', new Set())).toBe(
      'Q3 Sales _east_ _ _west_',
    )
    expect(safeSheetFileName('a/b\\c:d*e?f', new Set())).toBe('a_b_c_d_e_f')
    expect(safeSheetFileName('  padded  name  ', new Set())).toBe('padded name')
  })

  it('falls back to Sheet for empty or dot-only names', () => {
    expect(safeSheetFileName('', new Set())).toBe('Sheet')
    expect(safeSheetFileName('///', new Set())).toBe('_') // collapsed, still a usable name
    expect(safeSheetFileName('..', new Set())).toBe('Sheet')
  })

  it('caps the length at 80 characters', () => {
    expect(safeSheetFileName('x'.repeat(120), new Set())).toHaveLength(80)
  })

  it('deduplicates case-insensitively and records what it hands out', () => {
    const taken = new Set<string>()
    expect(safeSheetFileName('Data', taken)).toBe('Data')
    expect(safeSheetFileName('data', taken)).toBe('data (2)')
    expect(safeSheetFileName('DATA', taken)).toBe('DATA (3)')
    expect(taken.size).toBe(3)
  })
})

describe('serializeTable / encodeExport', () => {
  it('dispatches on the format', () => {
    const table: ExportValue[][] = [['a'], [1]]
    expect(serializeTable(table, opts({ format: 'csv' }))).toBe('a\r\n1\r\n')
    expect(JSON.parse(serializeTable(table, opts({ format: 'json-objects' })))).toEqual([{ a: 1 }])
    expect(JSON.parse(serializeTable(table, opts({ format: 'json-arrays' })))).toEqual([['a'], [1]])
  })

  it('prepends the byte-order mark only when asked', () => {
    expect(Array.from(encodeExport('a', true).slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(Array.from(encodeExport('a', false))).toEqual([0x61])
    expect(encodeExport('Chloé 名前', false)).toHaveLength(
      new TextEncoder().encode('Chloé 名前').length,
    )
  })
})

describe('CSV input opened in the viewer', () => {
  it('round-trips hazards.csv', () => {
    const wb = fixture('hazards.csv')
    const table = extractTable(wb.Sheets.Sheet1, false, opts())
    expect(table).toEqual([
      ['id', 'text', 'when'],
      [1, 'comma, inside', '2024-03-05'],
      [2, 'quote "inside"', '2024-03-06'],
      [3, 'multi\nline', '2024-03-07'],
      [4, 'plain', null],
    ])
    const rows = JSON.parse(toJson(table, 'objects')) as Record<string, ExportValue>[]
    expect(rows).toHaveLength(4)
    expect(rows[3]).toEqual({ id: 4, text: 'plain', when: null })
  })
})
