import { describe, expect, it } from 'vitest'
import {
  buildTsv,
  colLabel,
  compareCells,
  filterIndices,
  sortIndices,
  visibleRange,
} from './gridMath'

describe('colLabel', () => {
  it('maps indices to spreadsheet letters', () => {
    expect(colLabel(0)).toBe('A')
    expect(colLabel(25)).toBe('Z')
    expect(colLabel(26)).toBe('AA')
    expect(colLabel(51)).toBe('AZ')
    expect(colLabel(52)).toBe('BA')
    expect(colLabel(701)).toBe('ZZ')
    expect(colLabel(702)).toBe('AAA')
  })
})

describe('visibleRange', () => {
  it('computes the window with overscan', () => {
    expect(visibleRange(320, 480, 32, 1000, 5)).toEqual({ start: 5, end: 30 })
  })

  it('clamps at the edges', () => {
    expect(visibleRange(0, 480, 32, 1000, 5)).toEqual({ start: 0, end: 20 })
    expect(visibleRange(31680, 480, 32, 1000, 5)).toEqual({ start: 985, end: 1000 })
  })

  it('handles fewer rows than the viewport', () => {
    expect(visibleRange(0, 480, 32, 3, 5)).toEqual({ start: 0, end: 3 })
  })
})

describe('compareCells', () => {
  it('compares numeric strings as numbers', () => {
    expect(compareCells('9', '10')).toBeLessThan(0)
    expect(compareCells('1,000', '200')).toBeGreaterThan(0)
  })

  it('compares text lexically', () => {
    expect(compareCells('apple', 'banana')).toBeLessThan(0)
  })

  it('sorts empty cells last', () => {
    expect(compareCells('', 'a')).toBeGreaterThan(0)
    expect(compareCells('a', '')).toBeLessThan(0)
    expect(compareCells('', '')).toBe(0)
  })
})

describe('sortIndices', () => {
  const rows = [['b'], ['a'], [''], ['c'], ['a']]

  it('sorts ascending, empties last, stable for ties', () => {
    expect(sortIndices(rows, [0, 1, 2, 3, 4], 0, 'asc')).toEqual([1, 4, 0, 3, 2])
  })

  it('sorts descending with empties still last', () => {
    expect(sortIndices(rows, [0, 1, 2, 3, 4], 0, 'desc')).toEqual([3, 0, 1, 4, 2])
  })

  it('does not mutate the input indices', () => {
    const input = [0, 1, 2, 3, 4]
    sortIndices(rows, input, 0, 'asc')
    expect(input).toEqual([0, 1, 2, 3, 4])
  })
})

describe('filterIndices', () => {
  it('matches any cell, case-insensitive', () => {
    const rows = [
      ['Alpha', '1'],
      ['beta', '2'],
      ['gamma', 'ALPHA'],
    ]
    expect(filterIndices(rows, 'alpha')).toEqual([0, 2])
  })
})

describe('buildTsv', () => {
  it('joins cells with tabs and rows with newlines', () => {
    expect(
      buildTsv([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('a\tb\nc\td')
  })
})
