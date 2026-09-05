import { describe, expect, it } from 'vitest'
import {
  appendInk,
  boundsOf,
  canRedo,
  canUndo,
  clampToPage,
  commit,
  createCheck,
  createImage,
  createInk,
  createText,
  emptyHistory,
  formatDate,
  hitTest,
  HISTORY_LIMIT,
  moveObject,
  nextObjectId,
  redo,
  removeObject,
  replaceObject,
  resizeObject,
  scaleObject,
  textBaselineY,
  textHeight,
  undo,
  type InkObject,
  type SignObject,
  amend,
} from './objects'
import type { InkStroke } from './ink'

const stroke: InkStroke = [
  { x: 10, y: 10, p: 0.5 },
  { x: 30, y: 20, p: 0.5 },
  { x: 50, y: 10, p: 0.5 },
]

describe('ids', () => {
  it('are unique per call', () => {
    expect(nextObjectId('text')).not.toBe(nextObjectId('text'))
  })
})

describe('text metrics', () => {
  const t = createText(0, 10, 20, { text: 'a\nb\nc', size: 20 })

  it('stacks lines by the shared line-height ratio', () => {
    expect(textHeight(t)).toBe(3 * 20 * 1.25)
  })

  it('places the first baseline below the box top', () => {
    expect(textBaselineY(t)).toBe(20 + 16)
  })

  it('reports a box that matches width and line count', () => {
    expect(boundsOf(t)).toEqual({ x: 10, y: 20, width: t.width, height: 75 })
  })
})

describe('createInk', () => {
  const ink = createInk(1, [stroke], 4, '#000000')

  it('re-bases the strokes to the object top-left', () => {
    expect(ink.x).toBe(8)
    expect(ink.y).toBe(8)
    expect(ink.strokes[0][0]).toEqual({ x: 2, y: 2, p: 0.5 })
  })

  it('sizes the box from the padded stroke bounds', () => {
    expect(ink.width).toBe(44)
    expect(ink.height).toBe(14)
  })

  it('merges further strokes while keeping the id', () => {
    const merged = appendInk(ink, [[{ x: 80, y: 40, p: 0.5 }]])
    expect(merged.id).toBe(ink.id)
    expect(merged.strokes).toHaveLength(2)
    expect(merged.x).toBe(8)
    expect(merged.width).toBe(74)
  })
})

describe('formatDate', () => {
  const d = new Date(2026, 8, 5)
  it('formats all three presets', () => {
    expect(formatDate(d, 'iso')).toBe('2026-09-05')
    expect(formatDate(d, 'long')).toBe('5 Sep 2026')
    expect(formatDate(d, 'slash')).toBe('05/09/2026')
  })
})

describe('moveObject', () => {
  it('shifts the origin only', () => {
    const c = createCheck(0, 10, 10, 24)
    expect(moveObject(c, 5, -3)).toMatchObject({ x: 15, y: 7, size: 24 })
  })
})

describe('scaleObject', () => {
  it('scales text size and box width', () => {
    const t = createText(0, 0, 0, { size: 10, width: 80 })
    expect(scaleObject(t, 2)).toMatchObject({ size: 20, width: 160 })
  })

  it('scales an image box', () => {
    const img = createImage(0, 0, 0, 'img1', 100, 50)
    expect(scaleObject(img, 0.5)).toMatchObject({ width: 50, height: 25 })
  })

  it('scales ink points and thickness together', () => {
    const ink = createInk(0, [stroke], 4, '#000000')
    const big = scaleObject(ink, 2)
    expect(big.thickness).toBe(8)
    expect(big.strokes[0][0]).toEqual({ x: 4, y: 4, p: 0.5 })
    expect(big.width).toBe(ink.width * 2)
  })
})

describe('resizeObject', () => {
  const img = createImage(0, 100, 100, 'img1', 100, 50)

  it('keeps the opposite corner fixed when dragging se', () => {
    const out = resizeObject(img, 'se', 300, 100)
    expect(out.x).toBe(100)
    expect(out.y).toBe(100)
    expect(out.width).toBe(200)
    expect(out.height).toBe(100)
  })

  it('keeps the aspect ratio', () => {
    const out = resizeObject(img, 'se', 300, 999)
    expect(out.width / out.height).toBeCloseTo(2)
  })

  it('moves the origin when dragging nw', () => {
    const out = resizeObject(img, 'nw', 150, 150)
    expect(out.width).toBe(50)
    expect(out.height).toBe(25)
    expect(out.x).toBe(150)
    expect(out.y).toBe(125)
  })

  it('refuses to shrink below the minimum side', () => {
    const out = resizeObject(img, 'se', 100.1, 100.1)
    expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(8)
  })
})

describe('clampToPage', () => {
  it('pulls an object back inside the page', () => {
    const c = createCheck(0, 590, -20, 24)
    expect(clampToPage(c, 600, 800)).toMatchObject({ x: 576, y: 0 })
  })

  it('leaves an oversized object at the origin', () => {
    const img = createImage(0, -50, -50, 'i', 900, 900)
    expect(clampToPage(img, 600, 800)).toMatchObject({ x: 0, y: 0 })
  })
})

describe('hitTest', () => {
  const a = createCheck(0, 0, 0, 20)
  const b = createCheck(0, 10, 10, 20)
  const other = createCheck(1, 0, 0, 20)
  const objects: SignObject[] = [a, b, other]

  it('returns the topmost object under the point', () => {
    expect(hitTest(objects, 0, 15, 15)?.id).toBe(b.id)
  })

  it('ignores objects on other pages', () => {
    expect(hitTest(objects, 2, 5, 5)).toBeNull()
    expect(hitTest(objects, 1, 5, 5)?.id).toBe(other.id)
  })

  it('returns null on empty space', () => {
    expect(hitTest(objects, 0, 500, 500)).toBeNull()
  })
})

describe('replaceObject / removeObject', () => {
  const a = createCheck(0, 0, 0)
  const b = createCheck(0, 5, 5)

  it('replaces by id', () => {
    const out = replaceObject([a, b], { ...b, x: 99 })
    expect(out[1].x).toBe(99)
    expect(out[0]).toBe(a)
  })

  it('removes by id', () => {
    expect(removeObject([a, b], a.id).map((o) => o.id)).toEqual([b.id])
  })
})

describe('history', () => {
  const a = createCheck(0, 0, 0)
  const b = createCheck(1, 0, 0)

  it('undoes and redoes across pages', () => {
    let h = emptyHistory()
    h = commit(h, [a])
    h = commit(h, [a, b])
    expect(h.present).toHaveLength(2)
    h = undo(undo(h))
    expect(h.present).toHaveLength(0)
    expect(canUndo(h)).toBe(false)
    h = redo(redo(h))
    expect(h.present.map((o) => o.page)).toEqual([0, 1])
    expect(canRedo(h)).toBe(false)
  })

  it('drops the redo stack on a new commit', () => {
    let h = commit(commit(emptyHistory(), [a]), [a, b])
    h = undo(h)
    h = commit(h, [a, createCheck(2, 0, 0)])
    expect(canRedo(h)).toBe(false)
  })

  it('caps the past at the history limit', () => {
    let h = emptyHistory()
    for (let i = 0; i < HISTORY_LIMIT + 25; i++) h = commit(h, [createCheck(0, i, i)])
    expect(h.past.length).toBe(HISTORY_LIMIT)
  })

  it('is a no-op at the ends', () => {
    const h = emptyHistory()
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })
})

describe('ink object bounds', () => {
  it('are used for hit testing', () => {
    const ink: InkObject = createInk(0, [stroke], 4, '#000000')
    expect(hitTest([ink], 0, 20, 12)?.id).toBe(ink.id)
    expect(hitTest([ink], 0, 200, 12)).toBeNull()
  })
})

describe('clampToPage on creation', () => {
  it('pulls an object created at the corner fully onto the page', () => {
    const check = clampToPage(createCheck(0, 592, 839, 28, '#000'), 595, 842)
    expect(check.x).toBe(595 - 28)
    expect(check.y).toBe(842 - 28)
  })
})

describe('amend', () => {
  it('replaces the present state without adding a history step', () => {
    const first = commit(emptyHistory(), [createCheck(0, 10, 10, 20, '#000')])
    const amended = amend(first, [createCheck(0, 30, 30, 20, '#000')])
    expect(amended.past).toEqual(first.past)
    expect(amended.present[0]!.x).toBe(30)
    // Undo from the amended state lands before the whole burst, not mid-way.
    expect(undo(amended).present).toEqual([])
  })
})
