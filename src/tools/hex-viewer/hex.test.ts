import { describe, expect, it } from 'vitest'
import {
  byteToAscii,
  byteToHex,
  bytesToHex,
  extensionsMatch,
  filenameExtension,
  formatOffset,
  parseByteSearch,
  parseOffsetInput,
  visibleRows,
  windowStartForOffset,
  WINDOW_BYTES,
} from './hex'

describe('hex viewer helpers', () => {
  it('formats bytes, offsets and printable ASCII', () => {
    expect(byteToHex(10)).toBe('0A')
    expect(byteToAscii(0x41)).toBe('A')
    expect(byteToAscii(0)).toBe('·')
    expect(formatOffset(0x1a0, 1024)).toBe('000001A0')
    expect(bytesToHex(new Uint8Array([0, 10, 255]))).toBe('00 0A FF')
  })

  it('parses byte searches with common separators and prefixes', () => {
    expect(Array.from(parseByteSearch('0x89 50:4e-47'))).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(() => parseByteSearch('ABC')).toThrow('two hexadecimal digits')
    expect(() => parseByteSearch('GG')).toThrow('hexadecimal bytes only')
  })

  it('parses and bounds hexadecimal offsets', () => {
    expect(parseOffsetInput('0x1A0', 1024)).toBe(0x1a0)
    expect(parseOffsetInput('1_a_0', 1024)).toBe(0x1a0)
    expect(() => parseOffsetInput('400', 1024)).toThrow('between 0')
  })

  it('compares filename extensions with aliases', () => {
    expect(filenameExtension('photo.final.JPEG')).toBe('jpeg')
    expect(filenameExtension('.env')).toBeNull()
    expect(extensionsMatch('jpeg', 'jpg')).toBe(true)
    expect(extensionsMatch('png', 'jpg')).toBe(false)
  })

  it('aligns windows and virtualizes only visible rows', () => {
    expect(windowStartForOffset(WINDOW_BYTES + 123)).toBe(WINDOW_BYTES)
    expect(visibleRows(32 + 28 * 100, 280, 4096, 3)).toEqual({ start: 97, end: 113 })
  })
})
