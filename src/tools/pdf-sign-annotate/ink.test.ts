import { describe, expect, it } from 'vitest'
import {
  getSvgPathFromStroke,
  scaleStrokes,
  strokeBounds,
  strokeToPath,
  strokesToPath,
  translateStrokes,
  type InkStroke,
} from './ink'

const line: InkStroke = Array.from({ length: 12 }, (_, i) => ({ x: i * 4, y: 10 + i, p: 0.5 }))
const dot: InkStroke = [{ x: 3, y: 3, p: 0.5 }]

describe('getSvgPathFromStroke', () => {
  it('returns an empty string for degenerate outlines', () => {
    expect(getSvgPathFromStroke([])).toBe('')
    expect(
      getSvgPathFromStroke([
        [0, 0],
        [1, 1],
        [2, 2],
      ]),
    ).toBe('')
  })

  it('emits a closed quadratic path', () => {
    const d = getSvgPathFromStroke([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ])
    expect(d.startsWith('M0.00,0.00 Q')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('spells every segment out as Q — pdf-lib mis-parses the T shorthand', () => {
    const points = Array.from({ length: 12 }, (_, i) => [i * 10, (i % 2) * 6])
    const d = getSvgPathFromStroke(points)
    expect(d).not.toMatch(/T/)
    // First segment plus one per remaining interior point.
    expect(d.match(/Q/g)?.length).toBe(points.length - 2)
    expect(d.match(/M/g)?.length).toBe(1)
  })
})

describe('strokeToPath', () => {
  it('produces a fillable path for a normal stroke', () => {
    const d = strokeToPath(line, 4)
    expect(d.startsWith('M')).toBe(true)
    expect(d).toContain('Z')
  })

  it('is deterministic for the same input', () => {
    expect(strokeToPath(line, 4)).toBe(strokeToPath(line, 4))
  })

  it('changes with thickness', () => {
    expect(strokeToPath(line, 4)).not.toBe(strokeToPath(line, 10))
  })

  it('handles an empty stroke', () => {
    expect(strokeToPath([], 4)).toBe('')
  })

  it('draws a dot for a single point', () => {
    expect(strokeToPath(dot, 6).length).toBeGreaterThan(0)
  })
})

describe('strokesToPath', () => {
  it('concatenates one sub-path per stroke', () => {
    const d = strokesToPath([line, translateStrokes([line], 50, 0)[0]], 4)
    expect(d.match(/M/g)?.length).toBe(2)
  })
})

describe('strokeBounds', () => {
  it('pads by half the thickness', () => {
    expect(strokeBounds([line], 4)).toEqual({ minX: -2, minY: 8, maxX: 46, maxY: 23 })
  })

  it('returns a zero box for no points', () => {
    expect(strokeBounds([], 4)).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })
})

describe('translateStrokes / scaleStrokes', () => {
  it('translates without touching pressure', () => {
    const moved = translateStrokes([dot], 5, -1)
    expect(moved[0][0]).toEqual({ x: 8, y: 2, p: 0.5 })
  })

  it('scales around the origin', () => {
    expect(scaleStrokes([dot], 2)[0][0]).toEqual({ x: 6, y: 6, p: 0.5 })
  })

  it('scaling twice by k equals scaling once by k squared', () => {
    expect(scaleStrokes(scaleStrokes([line], 2), 3)[0]).toEqual(scaleStrokes([line], 6)[0])
  })
})
