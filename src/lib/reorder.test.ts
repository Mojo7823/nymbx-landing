import { describe, expect, it } from 'vitest'
import { moveItem } from './reorder'

describe('moveItem', () => {
  it('moves an element forward and backward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moves to first and last positions', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('returns an unchanged copy for no-op or out-of-range moves', () => {
    const arr = ['a', 'b', 'c']
    expect(moveItem(arr, 1, 1)).toEqual(arr)
    expect(moveItem(arr, -1, 2)).toEqual(arr)
    expect(moveItem(arr, 0, 3)).toEqual(arr)
    expect(moveItem(arr, 1, 1)).not.toBe(arr)
  })
})
