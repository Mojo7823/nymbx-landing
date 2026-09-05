import { describe, expect, it } from 'vitest'
import {
  normalizeRotate,
  viewedDrawAngle,
  viewedSize,
  viewedToUser,
  viewedTopLeftToUser,
} from './pdfGeometry'

describe('normalizeRotate', () => {
  it('snaps to the four quadrants', () => {
    expect(normalizeRotate(0)).toBe(0)
    expect(normalizeRotate(90)).toBe(90)
    expect(normalizeRotate(-90)).toBe(270)
    expect(normalizeRotate(450)).toBe(90)
    expect(normalizeRotate(359)).toBe(0)
    expect(normalizeRotate(-360)).toBe(0)
  })
})

describe('viewedSize', () => {
  it('swaps for quarter turns', () => {
    expect(viewedSize(600, 800, 0)).toEqual({ vw: 600, vh: 800 })
    expect(viewedSize(600, 800, 180)).toEqual({ vw: 600, vh: 800 })
    expect(viewedSize(600, 800, 90)).toEqual({ vw: 800, vh: 600 })
    expect(viewedSize(600, 800, 270)).toEqual({ vw: 800, vh: 600 })
  })
})

const PAGE = { width: 600, height: 800 }

describe('viewedTopLeftToUser', () => {
  it('maps the viewed top-left corner to the right user corner', () => {
    expect(viewedTopLeftToUser(0, 0, { ...PAGE, rotate: 0 })).toEqual({ x: 0, y: 800 })
    expect(viewedTopLeftToUser(0, 0, { ...PAGE, rotate: 90 })).toEqual({ x: 0, y: 0 })
    expect(viewedTopLeftToUser(0, 0, { ...PAGE, rotate: 180 })).toEqual({ x: 600, y: 0 })
    expect(viewedTopLeftToUser(0, 0, { ...PAGE, rotate: 270 })).toEqual({ x: 600, y: 800 })
  })

  it('maps an interior point for all four rotations', () => {
    // Hand-computed: viewed (100, 50) from the top-left of the displayed page.
    expect(viewedTopLeftToUser(100, 50, { ...PAGE, rotate: 0 })).toEqual({ x: 100, y: 750 })
    expect(viewedTopLeftToUser(100, 50, { ...PAGE, rotate: 90 })).toEqual({ x: 50, y: 100 })
    expect(viewedTopLeftToUser(100, 50, { ...PAGE, rotate: 180 })).toEqual({ x: 500, y: 50 })
    expect(viewedTopLeftToUser(100, 50, { ...PAGE, rotate: 270 })).toEqual({ x: 550, y: 700 })
  })

  it('keeps every mapped point inside the media box', () => {
    for (const rotate of [0, 90, 180, 270]) {
      const { vw, vh } = viewedSize(PAGE.width, PAGE.height, rotate)
      for (const [vx, vy] of [
        [0, 0],
        [vw, 0],
        [0, vh],
        [vw, vh],
        [vw / 3, vh / 7],
      ]) {
        const { x, y } = viewedTopLeftToUser(vx, vy, { ...PAGE, rotate })
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(PAGE.width)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(PAGE.height)
      }
    }
  })

  it('normalizes odd rotate values', () => {
    expect(viewedTopLeftToUser(100, 50, { ...PAGE, rotate: -270 })).toEqual(
      viewedTopLeftToUser(100, 50, { ...PAGE, rotate: 90 }),
    )
  })

  it('agrees with the y-up helper', () => {
    const { vh } = viewedSize(PAGE.width, PAGE.height, 90)
    expect(viewedTopLeftToUser(120, 30, { ...PAGE, rotate: 90 })).toEqual(
      viewedToUser(120, vh - 30, PAGE.width, PAGE.height, 90),
    )
  })
})

describe('viewedDrawAngle', () => {
  it('equals the normalized page rotation', () => {
    expect(viewedDrawAngle(0)).toBe(0)
    expect(viewedDrawAngle(90)).toBe(90)
    expect(viewedDrawAngle(-90)).toBe(270)
  })
})
