import { describe, expect, it } from 'vitest'
import {
  canonicalLabel,
  encodeText,
  EncodingUnsupportedError,
  getReverseTable,
} from './legacyEncoder'
import samples from './fixtures/samples.json'

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
}

const BOM_LENGTH: Record<string, number> = { 'utf-8': 3, 'utf-16le': 2, 'utf-16be': 2 }

describe('round trips against the fixtures', () => {
  const reversible = samples.samples.filter((s) => s.reversible)

  it('covers the ten legacy encodings plus Unicode', () => {
    expect(reversible.length).toBeGreaterThanOrEqual(16)
  })

  for (const [index, sample] of reversible.entries()) {
    it(`re-encodes ${sample.label} (#${index}) byte-identically`, () => {
      const bytes = base64ToBytes(sample.base64)
      const text = new TextDecoder(sample.label, { fatal: true }).decode(bytes)
      expect(text).toBe(sample.text)
      const result = encodeText(text, sample.label)
      expect(result.lost).toBe(0)
      expect(hex(result.bytes)).toBe(hex(bytes))
    })
  }

  for (const [index, sample] of samples.samples.filter((s) => s.bom).entries()) {
    it(`re-encodes the ${sample.bom} BOM fixture (#${index}) without the BOM`, () => {
      const bytes = base64ToBytes(sample.base64)
      const withoutBom = bytes.slice(BOM_LENGTH[sample.bom!])
      const result = encodeText(sample.text, sample.label)
      expect(result.lost).toBe(0)
      expect(hex(result.bytes)).toBe(hex(withoutBom))
    })
  }
})

describe('canonical byte sequences', () => {
  it('picks the last standard-area Big5 pointer for 十 and 卅', () => {
    expect(hex(encodeText('十卅═', 'big5').bytes)).toBe('A4 51 A4 CA A2 A4')
  })

  it('skips the shift_jis 0xED–0xEE duplicates (spec/cp932 behaviour)', () => {
    expect(hex(encodeText('≒∵￢', 'shift_jis').bytes)).toBe('81 E0 81 E6 81 CA')
    expect(hex(encodeText('ⅰ', 'shift_jis').bytes)).toBe('FA 40')
  })

  it('encodes € as gb18030 A2E3 even though 0x80 decodes to it', () => {
    expect(hex(encodeText('€', 'gb18030').bytes)).toBe('A2 E3')
    expect(new TextDecoder('gb18030').decode(new Uint8Array([0x80]))).toBe('€')
  })

  it('cannot encode gb18030 four-byte characters', () => {
    const result = encodeText('𠀀', 'gb18030')
    expect(result.lost).toBe(1)
    expect(result.lostSamples).toEqual(['𠀀'])
    expect(hex(result.bytes)).toBe('3F')
  })

  it('encodes half-width katakana per encoding', () => {
    expect(hex(encodeText('ｱ', 'shift_jis').bytes)).toBe('B1')
    expect(hex(encodeText('ｱ', 'euc-jp').bytes)).toBe('8E B1')
  })

  it('encodes single-byte encodings', () => {
    expect(hex(encodeText('é', 'windows-1252').bytes)).toBe('E9')
    expect(hex(encodeText('ł', 'iso-8859-2').bytes)).toBe('B3')
  })

  it('encodes Unicode targets natively', () => {
    expect(hex(encodeText('A€', 'utf-8').bytes)).toBe('41 E2 82 AC')
    expect(hex(encodeText('A€', 'utf-16le').bytes)).toBe('41 00 AC 20')
    expect(hex(encodeText('A€', 'utf-16be').bytes)).toBe('00 41 20 AC')
  })
})

describe('encoder behaviour', () => {
  it('replaces unmappable characters with ? and reports up to 5 samples', () => {
    const result = encodeText('aαβγδεζb', 'windows-1252')
    expect(result.lost).toBe(6)
    expect(result.lostSamples).toEqual(['α', 'β', 'γ', 'δ', 'ε'])
    expect(new TextDecoder('windows-1252').decode(result.bytes)).toBe('a??????b')
  })

  it('throws for iso-2022-jp', () => {
    expect(() => encodeText('日本語', 'iso-2022-jp')).toThrow(EncodingUnsupportedError)
  })

  it('handles empty input', () => {
    expect(encodeText('', 'big5').bytes.length).toBe(0)
  })

  it('resolves aliases to their canonical encoder', () => {
    expect(canonicalLabel('gbk')).toBe('gb18030')
    expect(canonicalLabel('latin1')).toBe('windows-1252')
    expect(canonicalLabel('utf-16')).toBe('utf-16le')
    expect(getReverseTable('gbk')).toBe(getReverseTable('gb18030'))
    expect(hex(encodeText('中', 'gbk').bytes)).toBe(hex(encodeText('中', 'gb18030').bytes))
  })

  it('builds the big5 reverse table quickly and caches it', () => {
    const start = performance.now()
    const table = getReverseTable('big5')
    const elapsed = performance.now() - start
    expect(table.size).toBeGreaterThan(9000)
    expect(elapsed).toBeLessThan(200)
    expect(getReverseTable('big5')).toBe(table)
  })
})
