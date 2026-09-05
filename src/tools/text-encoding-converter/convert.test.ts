import { describe, expect, it } from 'vitest'
import { convertToUtf8, decodeAll, lineEndings, normalizeLineEndings, roundTrip } from './convert'
import { outputFilename } from './filename'
import samples from './fixtures/samples.json'

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function fixture(predicate: (s: (typeof samples.samples)[number]) => boolean) {
  const found = samples.samples.find(predicate)
  if (!found) throw new Error('fixture not found')
  return { ...found, bytes: base64ToBytes(found.base64) }
}

describe('decodeAll', () => {
  it('decodes the whole buffer and reports no replacements for clean input', () => {
    const big5 = fixture((s) => s.label === 'big5')
    const result = decodeAll(big5.bytes, 'big5')
    expect(result.text).toBe(big5.text)
    expect(result.replacements).toBe(0)
    expect(result.bomStripped).toBe(false)
  })

  it('consumes a BOM and reports it', () => {
    const withBom = fixture((s) => s.bom === 'utf-8')
    const result = decodeAll(withBom.bytes, 'utf-8')
    expect(result.text).toBe(withBom.text)
    expect(result.text.startsWith('﻿')).toBe(false)
    expect(result.bomStripped).toBe(true)
  })

  it('counts undecodable sequences', () => {
    // Big5 bytes read as UTF-8.
    const big5 = fixture((s) => s.label === 'big5')
    const result = decodeAll(big5.bytes, 'utf-8')
    expect(result.replacements).toBeGreaterThan(0)
    expect(result.bomStripped).toBe(false)
  })
})

describe('lineEndings', () => {
  it('classifies mixed line endings and counts each kind', () => {
    const text = 'a\r\nb\r\nc\nd\ne\rf'
    expect(lineEndings(text)).toEqual({ crlf: 2, lf: 2, cr: 1, kind: 'mixed' })
  })

  it('classifies single-style and empty text', () => {
    expect(lineEndings('a\nb\n')).toMatchObject({ crlf: 0, lf: 2, cr: 0, kind: 'lf' })
    expect(lineEndings('a\r\nb\r\n')).toMatchObject({ crlf: 2, lf: 0, cr: 0, kind: 'crlf' })
    expect(lineEndings('a\rb\r')).toMatchObject({ crlf: 0, lf: 0, cr: 2, kind: 'cr' })
    expect(lineEndings('no breaks')).toMatchObject({ crlf: 0, lf: 0, cr: 0, kind: 'none' })
  })
})

describe('normalizeLineEndings', () => {
  const mixed = 'a\r\nb\nc\rd'

  it('leaves the text alone when keeping', () => {
    expect(normalizeLineEndings(mixed, 'keep')).toBe(mixed)
  })

  it('normalises to LF and to CRLF', () => {
    expect(normalizeLineEndings(mixed, 'lf')).toBe('a\nb\nc\nd')
    expect(normalizeLineEndings(mixed, 'crlf')).toBe('a\r\nb\r\nc\r\nd')
    // Idempotent: CRLF → CRLF must not double the carriage returns.
    expect(normalizeLineEndings('a\r\nb', 'crlf')).toBe('a\r\nb')
  })
})

describe('convertToUtf8', () => {
  it('encodes UTF-8 without a BOM by default', () => {
    const bytes = convertToUtf8('héllo', { bom: false, lineEndings: 'keep' })
    expect([...bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder('utf-8').decode(bytes)).toBe('héllo')
  })

  it('prepends the BOM when asked', () => {
    const bytes = convertToUtf8('hi', { bom: true, lineEndings: 'keep' })
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(bytes.length).toBe(5)
  })

  it('applies line-ending normalisation', () => {
    const crlf = convertToUtf8('a\r\nb\nc', { bom: false, lineEndings: 'crlf' })
    expect(new TextDecoder().decode(crlf)).toBe('a\r\nb\r\nc')
    const lf = convertToUtf8('a\r\nb\nc', { bom: false, lineEndings: 'lf' })
    expect(new TextDecoder().decode(lf)).toBe('a\nb\nc')
  })

  it('produces exactly the UTF-8 bytes of a decoded fixture', () => {
    const big5 = fixture((s) => s.label === 'big5')
    const { text } = decodeAll(big5.bytes, 'big5')
    const out = convertToUtf8(text, { bom: false, lineEndings: 'keep' })
    expect([...out]).toEqual([...new TextEncoder().encode(big5.text)])
  })
})

describe('outputFilename', () => {
  it('inserts .utf8 before the extension', () => {
    expect(outputFilename('report.big5.txt')).toBe('report.big5.utf8.txt')
    expect(outputFilename('data.csv')).toBe('data.csv'.replace('.csv', '.utf8.csv'))
  })

  it('appends .utf8.txt when there is no extension', () => {
    expect(outputFilename('README')).toBe('README.utf8.txt')
    expect(outputFilename('.hidden')).toBe('.hidden.utf8.txt')
    expect(outputFilename('  ')).toBe('converted.utf8.txt')
  })
})

describe('roundTrip', () => {
  it('reports identical for reversible fixtures', () => {
    for (const sample of samples.samples.filter((s) => s.reversible && !s.bom)) {
      const bytes = base64ToBytes(sample.base64)
      const { text } = decodeAll(bytes, sample.label)
      expect(roundTrip(bytes, sample.label, text), sample.label).toEqual({ status: 'identical' })
    }
  })

  it('ignores the BOM when comparing', () => {
    const withBom = fixture((s) => s.bom === 'utf-16le')
    const { text } = decodeAll(withBom.bytes, 'utf-16le')
    expect(roundTrip(withBom.bytes, 'utf-16le', text)).toEqual({ status: 'identical' })
  })

  it('reports differences with a byte count and the first offset', () => {
    const bytes = new TextEncoder().encode('abcdef')
    const result = roundTrip(bytes, 'utf-8', 'abXdef')
    expect(result.status).toBe('differs')
    expect(result.differing).toBe(1)
    expect(result.firstOffset).toBe(2)
  })

  it('counts a length difference too', () => {
    const bytes = new TextEncoder().encode('abc')
    const result = roundTrip(bytes, 'utf-8', 'ab')
    expect(result).toEqual({ status: 'differs', differing: 1, firstOffset: 2 })
  })

  it('reports the gb18030 four-byte fixture as not reversible', () => {
    const fourByte = fixture((s) => s.label === 'gb18030' && !s.reversible)
    const { text } = decodeAll(fourByte.bytes, 'gb18030')
    const result = roundTrip(fourByte.bytes, 'gb18030', text)
    expect(result.status).toBe('differs')
    expect(result.differing).toBeGreaterThan(0)
  })

  it('reports iso-2022-jp as unsupported', () => {
    const jis = fixture((s) => s.label === 'iso-2022-jp')
    const { text } = decodeAll(jis.bytes, 'iso-2022-jp')
    expect(roundTrip(jis.bytes, 'iso-2022-jp', text)).toEqual({ status: 'unsupported' })
  })

  it('skips files over 64 MB', () => {
    // A sparse view is enough: only `length` is consulted before the bail-out.
    const huge = { length: 64 * 1024 * 1024 + 1 } as Uint8Array
    expect(roundTrip(huge, 'big5', 'x')).toEqual({ status: 'skipped' })
  })
})
