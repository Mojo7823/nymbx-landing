import { describe, expect, it } from 'vitest'
import { addRotation, deletePages, initialPages, rotatePages } from './pageOps'

describe('initialPages', () => {
  it('creates one unrotated entry per page in order', () => {
    expect(initialPages(3)).toEqual([
      { srcIndex: 0, rotation: 0 },
      { srcIndex: 1, rotation: 0 },
      { srcIndex: 2, rotation: 0 },
    ])
  })
})

describe('addRotation', () => {
  it('wraps around 360 in both directions', () => {
    expect(addRotation(0, 90)).toBe(90)
    expect(addRotation(270, 90)).toBe(0)
    expect(addRotation(180, 270)).toBe(90)
    expect(addRotation(0, -90)).toBe(270)
    expect(addRotation(90, -90)).toBe(0)
  })
})

describe('rotatePages', () => {
  it('rotates only the targeted pages and keeps the rest untouched', () => {
    const pages = initialPages(3)
    const next = rotatePages(pages, new Set([1]), 90)
    expect(next.map((p) => p.rotation)).toEqual([0, 90, 0])
    expect(pages.map((p) => p.rotation)).toEqual([0, 0, 0])
  })

  it('accumulates across calls', () => {
    let pages = initialPages(1)
    pages = rotatePages(pages, new Set([0]), 90)
    pages = rotatePages(pages, new Set([0]), 180)
    expect(pages[0].rotation).toBe(270)
  })
})

describe('deletePages', () => {
  it('removes targeted pages preserving order', () => {
    const next = deletePages(initialPages(4), new Set([0, 2]))
    expect(next?.map((p) => p.srcIndex)).toEqual([1, 3])
  })

  it('allows deleting all but one page', () => {
    const next = deletePages(initialPages(4), new Set([0, 1, 2]))
    expect(next?.map((p) => p.srcIndex)).toEqual([3])
  })

  it('returns null when the delete would empty the document', () => {
    expect(deletePages(initialPages(2), new Set([0, 1]))).toBeNull()
  })
})
