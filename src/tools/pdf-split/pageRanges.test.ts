import { describe, expect, it } from 'vitest'
import { formatPageRanges, parsePageRanges } from './pageRanges'

describe('parsePageRanges', () => {
  it('parses single pages and ranges, sorted and deduped', () => {
    expect(parsePageRanges('1-3,7,9-10', 20).pages).toEqual([1, 2, 3, 7, 9, 10])
  })

  it('tolerates whitespace around tokens', () => {
    expect(parsePageRanges(' 1 - 3 , 7 ', 10).pages).toEqual([1, 2, 3, 7])
  })

  it('supports open-start ranges like -3 (from page 1)', () => {
    expect(parsePageRanges('-3', 10).pages).toEqual([1, 2, 3])
  })

  it('supports open-end ranges like 9- (to the last page)', () => {
    expect(parsePageRanges('9-', 11).pages).toEqual([9, 10, 11])
  })

  it('merges overlapping ranges without duplicates', () => {
    expect(parsePageRanges('1-5,3-7,5', 10).pages).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('rejects out-of-bounds pages with a clear error naming the token', () => {
    const result = parsePageRanges('1-3,25', 10)
    expect(result.error).toContain('25')
    expect(result.error).toMatch(/1.10/)
    expect(result.pages).toEqual([])
  })

  it('rejects reversed ranges like 5-3', () => {
    expect(parsePageRanges('5-3', 10).error).toContain('5-3')
  })

  it('rejects zero and negative page numbers', () => {
    expect(parsePageRanges('0', 10).error).toBeTruthy()
    expect(parsePageRanges('0-2', 10).error).toBeTruthy()
  })

  it('rejects malformed tokens', () => {
    expect(parsePageRanges('abc', 10).error).toBeTruthy()
    expect(parsePageRanges('1-2-3', 10).error).toBeTruthy()
    expect(parsePageRanges('--', 10).error).toBeTruthy()
  })

  it('returns empty selection (no error) for empty or blank input', () => {
    expect(parsePageRanges('', 10)).toEqual({ pages: [] })
    expect(parsePageRanges('  ', 10)).toEqual({ pages: [] })
  })

  it('ignores trailing commas', () => {
    expect(parsePageRanges('1,2,', 10).pages).toEqual([1, 2])
  })
})

describe('formatPageRanges', () => {
  it('compresses consecutive pages into ranges', () => {
    expect(formatPageRanges([1, 2, 3, 7, 9, 10, 11])).toBe('1-3,7,9-11')
  })

  it('handles single pages and empty selections', () => {
    expect(formatPageRanges([4])).toBe('4')
    expect(formatPageRanges([])).toBe('')
  })

  it('sorts unsorted input before compressing', () => {
    expect(formatPageRanges([3, 1, 2])).toBe('1-3')
  })
})
