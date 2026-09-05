import { describe, expect, it } from 'vitest'
import { compareCells, visibleRange } from './gridMath'

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

  it('returns an empty window for no rows', () => {
    expect(visibleRange(0, 480, 32, 0, 5)).toEqual({ start: 0, end: 0 })
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
