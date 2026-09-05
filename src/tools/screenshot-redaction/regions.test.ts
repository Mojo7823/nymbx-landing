import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BRUSH,
  MAX_BRUSH,
  MIN_BRUSH,
  MIN_REGION_SIZE,
  clampBox,
  clampBrushSize,
  clampRegion,
  createBrush,
  createRect,
  formatRegionSize,
  hitTest,
  modeLabel,
  moveRegion,
  normalizeRect,
  pixelBox,
  regionBounds,
  regionCountLabel,
  regionLabel,
  removeRegion,
  replaceRegion,
  resizeRect,
  type RegionStyle,
} from './regions'

const style: RegionStyle = { mode: 'black', color: '#000000', block: 16 }

describe('normalizeRect', () => {
  it('orders the corners', () => {
    expect(normalizeRect(10, 20, 4, 5)).toEqual({ x: 4, y: 5, width: 6, height: 15 })
    expect(normalizeRect(4, 5, 10, 20)).toEqual({ x: 4, y: 5, width: 6, height: 15 })
  })
})

describe('clampBox / pixelBox', () => {
  it('intersects with the image', () => {
    expect(clampBox({ x: -10, y: -5, width: 40, height: 20 }, 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 30,
      height: 15,
    })
    expect(clampBox({ x: 90, y: 90, width: 40, height: 40 }, 100, 100)).toEqual({
      x: 90,
      y: 90,
      width: 10,
      height: 10,
    })
    expect(clampBox({ x: 200, y: 200, width: 10, height: 10 }, 100, 100).width).toBe(0)
  })

  it('rounds to the nearest whole pixel and clips', () => {
    expect(pixelBox({ x: 10.4, y: 20.6, width: 5.2, height: 3.1 }, 100, 100)).toEqual({
      x: 10,
      y: 21,
      width: 6,
      height: 3,
    })
    expect(pixelBox({ x: -3.4, y: 98.2, width: 10, height: 10 }, 100, 100)).toEqual({
      x: 0,
      y: 98,
      width: 7,
      height: 2,
    })
  })
})

describe('region factories and bounds', () => {
  it('creates a rectangle with the current style and a clamped block', () => {
    const rect = createRect({ x: 5, y: 6, width: 40, height: 20 }, { ...style, block: 2 })
    expect(rect.kind).toBe('rect')
    expect(rect.block).toBe(8)
    expect(regionBounds(rect)).toEqual({ x: 5, y: 6, width: 40, height: 20 })
  })

  it('pads a brush bounding box by half the stroke width', () => {
    const brush = createBrush(
      [
        { x: 20, y: 20 },
        { x: 60, y: 40 },
      ],
      20,
      style,
    )
    expect(regionBounds(brush)).toEqual({ x: 10, y: 10, width: 60, height: 40 })
  })

  it('gives every region a unique id', () => {
    const a = createRect({ x: 0, y: 0, width: 1, height: 1 }, style)
    const b = createRect({ x: 0, y: 0, width: 1, height: 1 }, style)
    expect(a.id).not.toBe(b.id)
  })

  it('clamps the brush size', () => {
    expect(clampBrushSize(1)).toBe(MIN_BRUSH)
    expect(clampBrushSize(10_000)).toBe(MAX_BRUSH)
    expect(clampBrushSize(Number.NaN)).toBe(DEFAULT_BRUSH)
    expect(createBrush([{ x: 0, y: 0 }], 4, style).size).toBe(MIN_BRUSH)
  })

  it('copies the points it is given', () => {
    const points = [{ x: 1, y: 2 }]
    const brush = createBrush(points, 20, style)
    points[0].x = 99
    expect(brush.points[0]).toEqual({ x: 1, y: 2 })
  })
})

describe('moveRegion', () => {
  it('moves a rectangle', () => {
    const rect = createRect({ x: 10, y: 10, width: 5, height: 5 }, style)
    expect(moveRegion(rect, 4, -3)).toMatchObject({ x: 14, y: 7 })
  })

  it('moves every point of a stroke', () => {
    const brush = createBrush(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      20,
      style,
    )
    expect(moveRegion(brush, 5, 5).points).toEqual([
      { x: 5, y: 5 },
      { x: 15, y: 15 },
    ])
  })
})

describe('resizeRect', () => {
  const rect = createRect({ x: 100, y: 100, width: 100, height: 50 }, style)

  it('keeps the opposite corner fixed', () => {
    expect(resizeRect(rect, 'se', 260, 190)).toMatchObject({
      x: 100,
      y: 100,
      width: 160,
      height: 90,
    })
    expect(resizeRect(rect, 'nw', 60, 70)).toMatchObject({
      x: 60,
      y: 70,
      width: 140,
      height: 80,
    })
  })

  it('does not go below the minimum size', () => {
    const tiny = resizeRect(rect, 'se', 100, 100)
    expect(tiny).toMatchObject({ width: MIN_REGION_SIZE, height: MIN_REGION_SIZE })
  })

  it('flips cleanly when dragged past the anchor', () => {
    expect(resizeRect(rect, 'se', 40, 60)).toMatchObject({
      x: 40,
      y: 60,
      width: 60,
      height: 40,
    })
  })
})

describe('clampRegion', () => {
  it('pulls a rectangle back onto the image', () => {
    const rect = createRect({ x: -20, y: 900, width: 50, height: 50 }, style)
    expect(clampRegion(rect, 800, 600)).toMatchObject({ x: 0, y: 550, width: 50, height: 50 })
  })

  it('shrinks a rectangle larger than the image', () => {
    const rect = createRect({ x: -50, y: -50, width: 2000, height: 2000 }, style)
    expect(clampRegion(rect, 800, 600)).toMatchObject({ x: 0, y: 0, width: 800, height: 600 })
  })

  it('shifts a stroke without changing its shape', () => {
    const brush = createBrush(
      [
        { x: -30, y: 10 },
        { x: 0, y: 40 },
      ],
      20,
      style,
    )
    const clamped = clampRegion(brush, 800, 600)
    expect(regionBounds(clamped).x).toBe(0)
    // Shape preserved: the point spacing is unchanged.
    expect(clamped.points[1].x - clamped.points[0].x).toBe(30)
  })

  it('leaves a region that is already inside untouched', () => {
    const rect = createRect({ x: 10, y: 10, width: 20, height: 20 }, style)
    expect(clampRegion(rect, 800, 600)).toMatchObject({ x: 10, y: 10 })
  })
})

describe('hitTest', () => {
  const back = createRect({ x: 0, y: 0, width: 100, height: 100 }, style)
  const front = createRect({ x: 50, y: 50, width: 100, height: 100 }, style)
  const regions = [back, front]

  it('returns the topmost region under the point', () => {
    expect(hitTest(regions, 60, 60)?.id).toBe(front.id)
    expect(hitTest(regions, 10, 10)?.id).toBe(back.id)
    expect(hitTest(regions, 400, 400)).toBeNull()
  })

  it('hits a stroke inside its padded box', () => {
    const brush = createBrush([{ x: 500, y: 500 }], 40, style)
    expect(hitTest([brush], 485, 515)?.id).toBe(brush.id)
    expect(hitTest([brush], 400, 400)).toBeNull()
  })
})

describe('list operations', () => {
  it('replaces and removes by id', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 }, style)
    const b = createRect({ x: 20, y: 20, width: 10, height: 10 }, style)
    const moved = moveRegion(b, 5, 5)
    expect(replaceRegion([a, b], moved)[1]).toMatchObject({ x: 25, y: 25 })
    expect(removeRegion([a, b], a.id).map((r) => r.id)).toEqual([b.id])
    expect(removeRegion([a, b], 'nope')).toHaveLength(2)
  })
})

describe('labels', () => {
  it('describes regions for the list', () => {
    const rect = createRect({ x: 0, y: 0, width: 420.4, height: 38.2 }, style)
    expect(regionLabel(rect)).toBe('Rectangle')
    expect(formatRegionSize(rect)).toBe('420 × 38 px')
    expect(regionLabel(createBrush([{ x: 0, y: 0 }], 20, style))).toBe('Brush')
    expect(modeLabel('black')).toBe('Black-out')
    expect(modeLabel('pixelate')).toBe('Pixelate')
    expect(regionCountLabel(0)).toBe('0 regions')
    expect(regionCountLabel(1)).toBe('1 region')
    expect(regionCountLabel(3)).toBe('3 regions')
  })
})
