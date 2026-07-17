import { describe, expect, it } from 'vitest'
import {
  PAGE_MARGIN_PT,
  PT_PER_PX,
  isMirrored,
  placeOnPage,
  rotatedDraw,
  swapsDimensions,
} from './pageLayout'

describe('placeOnPage', () => {
  it('fit mode sizes the page exactly to the image at 96 dpi', () => {
    const p = placeOnPage(960, 720, 'fit')
    expect(p).toEqual({ pageWidth: 720, pageHeight: 540, x: 0, y: 0, width: 720, height: 540 })
  })

  it('fit mode guards zero dimensions', () => {
    const p = placeOnPage(0, 0, 'fit')
    expect(p.pageWidth).toBe(PT_PER_PX)
    expect(p.pageHeight).toBe(PT_PER_PX)
  })

  it('a4 portrait image gets a portrait page, fitted and centered', () => {
    const p = placeOnPage(1000, 2000, 'a4')
    expect(p.pageWidth).toBeCloseTo(595.28)
    expect(p.pageHeight).toBeCloseTo(841.89)
    const scale = (841.89 - 2 * PAGE_MARGIN_PT) / 2000
    expect(p.width).toBeCloseTo(1000 * scale)
    expect(p.height).toBeCloseTo(841.89 - 2 * PAGE_MARGIN_PT)
    expect(p.x).toBeCloseTo((595.28 - p.width) / 2)
    expect(p.y).toBeCloseTo(PAGE_MARGIN_PT)
  })

  it('a4 landscape image turns the page landscape', () => {
    const p = placeOnPage(2000, 1000, 'a4')
    expect(p.pageWidth).toBeCloseTo(841.89)
    expect(p.pageHeight).toBeCloseTo(595.28)
  })

  it('letter uses 612×792', () => {
    const p = placeOnPage(100, 200, 'letter')
    expect(p.pageWidth).toBe(612)
    expect(p.pageHeight).toBe(792)
  })

  it('small images are scaled up to fill the content box', () => {
    const p = placeOnPage(100, 100, 'a4')
    expect(p.width).toBeCloseTo(595.28 - 2 * PAGE_MARGIN_PT)
    expect(p.height).toBeCloseTo(595.28 - 2 * PAGE_MARGIN_PT)
  })
})

describe('orientation helpers', () => {
  it('orientations 5–8 swap dimensions', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(swapsDimensions)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ])
  })

  it('orientations 2, 4, 5, 7 are mirrored', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(isMirrored)).toEqual([
      false,
      true,
      false,
      true,
      true,
      false,
      true,
      false,
    ])
  })
})

describe('rotatedDraw', () => {
  const rect = { x: 10, y: 20, width: 30, height: 40 }

  it('orientation 1 draws the rect as-is', () => {
    expect(rotatedDraw(1, rect)).toEqual({ ...rect, rotate: 0 })
  })

  it('orientation 3 rotates 180° around the top-right anchor', () => {
    expect(rotatedDraw(3, rect)).toEqual({ x: 40, y: 60, width: 30, height: 40, rotate: 180 })
  })

  it('orientation 6 rotates -90° with swapped drawn dimensions', () => {
    expect(rotatedDraw(6, rect)).toEqual({ x: 10, y: 60, width: 40, height: 30, rotate: -90 })
  })

  it('orientation 8 rotates 90° with swapped drawn dimensions', () => {
    expect(rotatedDraw(8, rect)).toEqual({ x: 40, y: 20, width: 40, height: 30, rotate: 90 })
  })
})
