import { describe, expect, it } from 'vitest'
import {
  activeStrokes,
  canRedo,
  canUndo,
  emptyHistory,
  fitScale,
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
