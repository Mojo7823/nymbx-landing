import { describe, expect, it } from 'vitest'
import {
  activeStrokes,
  canRedo,
  canUndo,
  emptyHistory,
  fitScale,
  mergeAlpha,
  pushStroke,
  redo,
  undo,
  type Stroke,
} from './mask'

function stroke(n: number): Stroke {
  return { mode: 'keep', size: 10, points: [{ x: n, y: n }] }
}

describe('stroke history', () => {
  it('starts empty with nothing to undo or redo', () => {
    expect(activeStrokes(emptyHistory)).toEqual([])
    expect(canUndo(emptyHistory)).toBe(false)
    expect(canRedo(emptyHistory)).toBe(false)
  })

  it('pushes strokes and undoes/redoes them exactly', () => {
    let h = pushStroke(pushStroke(emptyHistory, stroke(1)), stroke(2))
    expect(activeStrokes(h)).toEqual([stroke(1), stroke(2)])

    h = undo(h)
    expect(activeStrokes(h)).toEqual([stroke(1)])
    expect(canRedo(h)).toBe(true)

    h = redo(h)
    expect(activeStrokes(h)).toEqual([stroke(1), stroke(2)])
    expect(canRedo(h)).toBe(false)
  })

  it('is a no-op to undo at the start or redo at the end', () => {
    expect(undo(emptyHistory)).toEqual(emptyHistory)
    const h = pushStroke(emptyHistory, stroke(1))
    expect(redo(h)).toEqual(h)
  })

  it('truncates the redo branch when a new stroke follows an undo', () => {
    let h = pushStroke(pushStroke(emptyHistory, stroke(1)), stroke(2))
    h = pushStroke(undo(h), stroke(3))
    expect(activeStrokes(h)).toEqual([stroke(1), stroke(3)])
    expect(canRedo(h)).toBe(false)
  })
})

describe('fitScale', () => {
  it('scales a large image down to fit the viewport', () => {
    expect(fitScale(2000, 1000, 1000, 800)).toBe(0.5)
    expect(fitScale(1000, 2000, 1000, 800)).toBe(0.4)
  })

  it('never upscales a small image', () => {
    expect(fitScale(400, 300, 1000, 800)).toBe(1)
  })

  it('falls back to 1 for degenerate dimensions', () => {
    expect(fitScale(0, 0, 1000, 800)).toBe(1)
  })
})

describe('mergeAlpha', () => {
  // One-pixel helpers: base alpha value + one RGBA correction pixel.
  function merge(base: number, [r, g, b, a]: [number, number, number, number]): number {
    const out = mergeAlpha(new Uint8ClampedArray([base]), new Uint8ClampedArray([r, g, b, a]))
    return out[0]
  }

  it('forces fully-painted keep pixels opaque', () => {
    expect(merge(0, [0, 255, 0, 255])).toBe(255)
    expect(merge(128, [0, 255, 0, 255])).toBe(255)
  })

  it('forces fully-painted remove pixels transparent', () => {
    expect(merge(255, [255, 0, 0, 255])).toBe(0)
    expect(merge(128, [255, 0, 0, 255])).toBe(0)
  })

  it('leaves untouched pixels exactly at the AI alpha', () => {
    expect(merge(0, [0, 0, 0, 0])).toBe(0)
    expect(merge(37, [0, 0, 0, 0])).toBe(37)
    expect(merge(255, [0, 0, 0, 0])).toBe(255)
  })

  it('blends proportionally at feathered edges', () => {
    // 50% coverage keep over transparent -> halfway to opaque
    expect(merge(0, [0, 255, 0, 128])).toBe(128)
    // 50% coverage remove over opaque -> halfway to transparent
    expect(merge(255, [255, 0, 0, 128])).toBe(127)
  })

  it('does not mutate the base array and preserves neighbours', () => {
    const base = new Uint8ClampedArray([10, 20, 30])
    const corrections = new Uint8ClampedArray([
      0,
      0,
      0,
      0, // pixel 0 untouched
      0,
      255,
      0,
      255, // pixel 1 keep
      255,
      0,
      0,
      255, // pixel 2 remove
    ])
    const out = mergeAlpha(base, corrections)
    expect(Array.from(out)).toEqual([10, 255, 0])
    expect(Array.from(base)).toEqual([10, 20, 30])
  })
})
