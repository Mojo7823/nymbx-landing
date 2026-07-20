import { describe, expect, it } from 'vitest'
import {
  ENCODE_CHUNK,
  decodeBase64,
  encodeBytes,
  encodeText,
  fileToBase64,
  parseBase64Input,
  toDataUri,
} from './codec'

const bytes = (...values: number[]) => new Uint8Array(values)

describe('encode', () => {
  it('encodes UTF-8 text with CJK and emoji', () => {
    expect(encodeText('資料轉換 🎉', false)).toBe('6LOH5paZ6L2J5o+bIPCfjok=')
  })

  it('encodes bytes with the standard alphabet and padding', () => {
    expect(encodeBytes(bytes(251, 255, 190), false)).toBe('+/++')
    expect(encodeBytes(bytes(0), false)).toBe('AA==')
    expect(encodeBytes(bytes(), false)).toBe('')
  })

  it('uses -_ and drops padding for the URL-safe alphabet', () => {
    expect(encodeBytes(bytes(251, 255, 190), true)).toBe('-_--')
    expect(encodeBytes(bytes(0), true)).toBe('AA')
  })

  it('encodes large inputs identically to a reference implementation', () => {
    const data = new Uint8Array(300_000).map((_, i) => i % 256)
    const reference = Buffer.from(data).toString('base64')
    expect(encodeBytes(data, false)).toBe(reference)
  })
})

describe('decode', () => {
  it('round-trips UTF-8 text exactly', () => {
    const original = '中文繁體 → simplified 简体 🚀🇹🇼 ñ'
    const decoded = decodeBase64(encodeText(original, false))
    expect(decoded.text).toBe(original)
  })

  it('round-trips binary byte-identically', () => {
    const data = new Uint8Array(65_537).map(() => Math.floor(Math.random() * 256))
    expect(decodeBase64(encodeBytes(data, false)).bytes).toEqual(data)
  })

  it('accepts URL-safe input with or without padding', () => {
    expect(decodeBase64('-_--').bytes).toEqual(bytes(251, 255, 190))
    expect(decodeBase64('AA').bytes).toEqual(bytes(0))
  })

  it('ignores whitespace and line wrapping', () => {
    expect(decodeBase64('aGVs\nbG8g  d29y\r\nbGQ=').text).toBe('hello world')
  })

  it('flags non-text bytes so callers can offer a binary download instead', () => {
    const result = decodeBase64(encodeBytes(bytes(0, 159, 146, 150), false))
    expect(result.text).toBeUndefined()
    expect(result.bytes).toEqual(bytes(0, 159, 146, 150))
  })

  it('rejects invalid characters with their position', () => {
    expect(() => decodeBase64('aGV$sbG8')).toThrow('character 4')
  })

  it('rejects impossible lengths', () => {
    expect(() => decodeBase64('aGVsbG8xA')).toThrow('length')
  })

  it('rejects empty input', () => {
    expect(() => decodeBase64('   ')).toThrow('empty')
  })
})

describe('fileToBase64', () => {
  it('streams a file in chunks and matches a whole-buffer encode', async () => {
    const data = new Uint8Array(ENCODE_CHUNK + 1000).map((_, i) => (i * 7) % 256)
    const progress: number[] = []
    const encoded = await fileToBase64(new File([data], 'blob.bin'), false, (v) => progress.push(v))
    expect(encoded).toBe(encodeBytes(data, false))
    expect(progress.at(-1)).toBe(1)
  })

  it('honors the URL-safe alphabet across chunk boundaries', async () => {
    const data = new Uint8Array(ENCODE_CHUNK + 2).fill(251)
    const encoded = await fileToBase64(new File([data], 'blob.bin'), true, () => undefined)
    expect(encoded).toBe(encodeBytes(data, true))
  })
})

describe('data URIs', () => {
  it('builds a data URI with the given MIME type', () => {
    expect(toDataUri('AA==', 'image/png')).toBe('data:image/png;base64,AA==')
  })

  it('parseBase64Input strips a data-URI prefix and reports its MIME type', () => {
    const parsed = parseBase64Input('data:image/png;base64,iVBORw0KGgo=')
    expect(parsed).toEqual({ base64: 'iVBORw0KGgo=', mime: 'image/png' })
  })

  it('parseBase64Input passes plain base64 through unchanged', () => {
    expect(parseBase64Input(' AA== ')).toEqual({ base64: 'AA==', mime: undefined })
  })
})
