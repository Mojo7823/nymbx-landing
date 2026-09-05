import { describe, expect, it } from 'vitest'
import {
  HISTORY_LIMIT,
  amend,
  canRedo,
  canUndo,
  commit,
  emptyHistory,
  redo,
  undo,
  type History,
} from './history'

describe('history', () => {
  it('starts empty at the given present state', () => {
    const h = emptyHistory<number[]>([])
    expect(h).toEqual({ past: [], present: [], future: [] })
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('undoes and redoes commits', () => {
    let h: History<string[]> = emptyHistory<string[]>([])
    h = commit(h, ['a'])
    h = commit(h, ['a', 'b'])
    expect(h.present).toEqual(['a', 'b'])

    h = undo(h)
    expect(h.present).toEqual(['a'])
    expect(canRedo(h)).toBe(true)
    h = undo(h)
    expect(h.present).toEqual([])
    expect(canUndo(h)).toBe(false)

    h = redo(redo(h))
    expect(h.present).toEqual(['a', 'b'])
    expect(canRedo(h)).toBe(false)
  })

  it('drops the redo stack on a new commit', () => {
    let h = commit(commit(emptyHistory<string[]>([]), ['a']), ['a', 'b'])
    h = undo(h)
    expect(canRedo(h)).toBe(true)
    h = commit(h, ['a', 'c'])
    expect(canRedo(h)).toBe(false)
    expect(h.present).toEqual(['a', 'c'])
  })

  it('caps the past at the history limit', () => {
    let h = emptyHistory<number>(0)
    for (let i = 1; i <= HISTORY_LIMIT + 25; i++) h = commit(h, i)
    expect(h.past.length).toBe(HISTORY_LIMIT)
    // The oldest states fell off the front; the newest are still there.
    expect(h.past[h.past.length - 1]).toBe(HISTORY_LIMIT + 24)
  })

  it('is a no-op at both ends', () => {
    const h = emptyHistory<number>(0)
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })

  it('never mutates the history it is given', () => {
    const h = emptyHistory<number[]>([1])
    const next = commit(h, [1, 2])
    expect(h).toEqual({ past: [], present: [1], future: [] })
    expect(next.past).toEqual([[1]])
  })

  it('amend replaces the present without adding a step', () => {
    const first = commit(emptyHistory<string[]>([]), ['a'])
    const amended = amend(first, ['a', 'b'])
    expect(amended.past).toEqual(first.past)
    expect(amended.present).toEqual(['a', 'b'])
    // Undo from an amended state lands before the whole burst, not mid-way.
    expect(undo(amended).present).toEqual([])
  })
})
