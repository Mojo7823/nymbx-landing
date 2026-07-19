import { describe, expect, it } from 'vitest'
import { csvFileToJson, csvToJson, jsonToCsv } from './convert'

describe('CSV → JSON', () => {
  it('handles quoted commas and newlines', async () => {
    const result = csvToJson('name,note\nAda,"hello,\nworld"', true, 'auto')
    expect(JSON.parse(await result.blob.text())).toEqual([{ name: 'Ada', note: 'hello,\nworld' }])
    expect(result.delimiter).toBe(',')
  })

  it('auto-detects semicolons and supports headerless rows', async () => {
    const result = csvToJson('Ada;37\nGrace;42', false, 'auto')
    expect(JSON.parse(await result.blob.text())).toEqual([
      ['Ada', '37'],
      ['Grace', '42'],
    ])
    expect(result.preview.headers).toEqual(['Column 1', 'Column 2'])
    expect(result.delimiter).toBe(';')
  })

  it('honors an explicit tab delimiter', async () => {
    const result = csvToJson('Ada\t37\nGrace\t42', false, '\t')
    expect(JSON.parse(await result.blob.text())).toEqual([
      ['Ada', '37'],
      ['Grace', '42'],
    ])
    expect(result.delimiter).toBe('\t')
  })

  it('streams a local File into valid JSON', async () => {
    const file = new File(['name;note\nAda;"comma, stays"\nGrace;"two\nlines"'], 'data.csv')
    const progress: number[] = []
    const result = await csvFileToJson(file, true, 'auto', (value) => progress.push(value))
    expect(JSON.parse(await result.blob.text())).toEqual([
      { name: 'Ada', note: 'comma, stays' },
      { name: 'Grace', note: 'two\nlines' },
    ])
    expect(result.preview.totalRows).toBe(2)
    expect(progress.at(-1)).toBe(1)
  })

  it('preserves a quoted field across the 1 MB chunk boundary', async () => {
    const note = `${'x'.repeat(1024 * 1024)}\ny`
    const file = new File([`name,note\nAda,"${note}"`], 'large-field.csv')
    const result = await csvFileToJson(file, true, 'auto', () => undefined)
    expect((JSON.parse(await result.blob.text()) as { note: string }[])[0]?.note).toBe(note)
  })
})

describe('JSON → CSV', () => {
  it('unions object keys so missing values keep consistent columns', async () => {
    const result = jsonToCsv('[{"a":1},{"b":2}]', true, ',')
    expect(await result.blob.text()).toBe('a,b\r\n1,\r\n,2')
  })

  it('quotes embedded delimiters and newlines', async () => {
    const result = jsonToCsv('[{"note":"hello,\\nworld"}]', true, ',')
    expect(await result.blob.text()).toBe('note\r\n"hello,\nworld"')
  })

  it('escapes spreadsheet formulae', async () => {
    const result = jsonToCsv('[{"value":"=2+2"}]', true, ',')
    expect(await result.blob.text()).toContain("'=2+2")
  })

  it('rejects mixed row shapes', () => {
    expect(() => jsonToCsv('[{"a":1},[2]]', true, ',')).toThrow('same shape')
  })
})
