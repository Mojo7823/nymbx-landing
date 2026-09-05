import { describe, expect, it } from 'vitest'
import {
  formatPdfDate,
  fromDatetimeLocal,
  looksLikePdfDate,
  parsePdfDate,
  pdfDateHasZone,
  toDatetimeLocal,
} from './pdfDate'

describe('parsePdfDate', () => {
  it('parses a full UTC date', () => {
    const date = parsePdfDate('D:20240305021530Z')
    expect(date?.toISOString()).toBe('2024-03-05T02:15:30.000Z')
  })

  it('applies a positive UTC offset', () => {
    const date = parsePdfDate("D:20240305101530+08'00'")
    expect(date?.toISOString()).toBe('2024-03-05T02:15:30.000Z')
  })

  it('applies a negative UTC offset without trailing quote', () => {
    const date = parsePdfDate("D:20240305021530-05'30")
    expect(date?.toISOString()).toBe('2024-03-05T07:45:30.000Z')
  })

  it('defaults missing parts to January 1st, midnight', () => {
    expect(parsePdfDate('D:2024')?.toISOString()).toBe('2024-01-01T00:00:00.000Z')
  })

  it('accepts a date with no D: prefix', () => {
    expect(parsePdfDate('20240305')?.toISOString()).toBe('2024-03-05T00:00:00.000Z')
  })

  it('returns null for an unrecognised string', () => {
    expect(parsePdfDate('not-a-date')).toBeNull()
    expect(parsePdfDate('')).toBeNull()
    expect(looksLikePdfDate('not-a-date')).toBe(false)
    expect(looksLikePdfDate('D:20240305021530Z')).toBe(true)
  })

  it('reports whether a time zone was given', () => {
    expect(pdfDateHasZone('D:20240305021530Z')).toBe(true)
    expect(pdfDateHasZone("D:20240305101530+08'00'")).toBe(true)
    expect(pdfDateHasZone('D:20240305021530')).toBe(false)
  })
})

describe('formatPdfDate', () => {
  it('writes UTC with the D: prefix and Z suffix', () => {
    expect(formatPdfDate(new Date('2024-03-05T02:15:30Z'))).toBe('D:20240305021530Z')
  })

  it('round-trips through parsePdfDate', () => {
    for (const raw of ['D:20240305021530Z', "D:20240305101530+08'00'", 'D:2024', '20240305']) {
      const date = parsePdfDate(raw)!
      expect(parsePdfDate(formatPdfDate(date))!.getTime()).toBe(date.getTime())
    }
  })
})

describe('datetime-local helpers', () => {
  it('round-trips a local date through the input value', () => {
    const date = new Date(2024, 2, 5, 10, 15, 30)
    const value = toDatetimeLocal(date)
    expect(value).toBe('2024-03-05T10:15:30')
    expect(fromDatetimeLocal(value)?.getTime()).toBe(date.getTime())
  })

  it('returns null for an empty or invalid input value', () => {
    expect(fromDatetimeLocal('')).toBeNull()
    expect(fromDatetimeLocal('nonsense')).toBeNull()
  })
})
