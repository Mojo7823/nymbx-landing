import { describe, expect, it } from 'vitest'
import { computeTarget, nextScale, outputFileName, type ResizeSettings } from './resizeMath'

const base: ResizeSettings = {
  mode: 'pixels',
  width: null,
  height: null,
  lockAspect: true,
  percent: 50,
  presetEdge: 1280,
}

describe('computeTarget', () => {
  describe('pixels mode with locked aspect', () => {
    it('scales height from width', () => {
      expect(computeTarget({ width: 1920, height: 1080 }, { ...base, width: 960 })).toEqual({
        width: 960,
        height: 540,
      })
    })

    it('scales width from height', () => {
      expect(computeTarget({ width: 1920, height: 1080 }, { ...base, height: 540 })).toEqual({
        width: 960,
        height: 540,
      })
    })

    it('fits within the box when both are given', () => {
      // 1920×1080 into 1000×1000 → limited by width
      expect(
        computeTarget({ width: 1920, height: 1080 }, { ...base, width: 1000, height: 1000 }),
      ).toEqual({ width: 1000, height: 563 })
      // portrait image limited by height
      expect(
        computeTarget({ width: 1080, height: 1920 }, { ...base, width: 1000, height: 1000 }),
      ).toEqual({ width: 563, height: 1000 })
    })

    it('returns the source size when neither is given', () => {
      expect(computeTarget({ width: 640, height: 480 }, { ...base })).toEqual({
        width: 640,
        height: 480,
      })
    })

    it('supports upscaling', () => {
      expect(computeTarget({ width: 100, height: 50 }, { ...base, width: 400 })).toEqual({
        width: 400,
        height: 200,
      })
    })
  })

  describe('pixels mode without locked aspect', () => {
    it('stretches to the exact box', () => {
      expect(
        computeTarget(
          { width: 1920, height: 1080 },
          { ...base, lockAspect: false, width: 500, height: 500 },
        ),
      ).toEqual({ width: 500, height: 500 })
    })

    it('keeps the source dimension when one side is missing', () => {
      expect(
        computeTarget({ width: 1920, height: 1080 }, { ...base, lockAspect: false, width: 500 }),
      ).toEqual({ width: 500, height: 1080 })
    })
  })

  describe('percent mode', () => {
    it('scales both dimensions', () => {
      expect(
        computeTarget({ width: 1920, height: 1080 }, { ...base, mode: 'percent', percent: 50 }),
      ).toEqual({ width: 960, height: 540 })
    })

    it('rounds to whole pixels', () => {
      expect(
        computeTarget({ width: 101, height: 51 }, { ...base, mode: 'percent', percent: 50 }),
      ).toEqual({ width: 51, height: 26 })
    })

    it('never collapses below 1px', () => {
      expect(
        computeTarget({ width: 10, height: 10 }, { ...base, mode: 'percent', percent: 1 }),
      ).toEqual({ width: 1, height: 1 })
    })
  })

  describe('preset mode', () => {
    it('fits the longest edge for landscape', () => {
      expect(
        computeTarget({ width: 4000, height: 3000 }, { ...base, mode: 'preset', presetEdge: 1280 }),
      ).toEqual({ width: 1280, height: 960 })
    })

    it('fits the longest edge for portrait', () => {
      expect(
        computeTarget({ width: 3000, height: 4000 }, { ...base, mode: 'preset', presetEdge: 1280 }),
      ).toEqual({ width: 960, height: 1280 })
    })
  })
})

describe('nextScale', () => {
  it('shrinks by the square root of the byte ratio with a safety margin', () => {
    // 4× too big → √(1/4) = 0.5, × 0.9 safety → 0.45
    expect(nextScale(1, 2_000_000, 500_000)).toBeCloseTo(0.45)
  })

  it('always makes real progress even when barely over target', () => {
    // 1% over target: estimate would be ~0.895… but capped at scale × 0.9
    expect(nextScale(1, 505_000, 500_000)).toBeLessThanOrEqual(0.9)
  })

  it('compounds from the current scale', () => {
    expect(nextScale(0.5, 1_000_000, 250_000)).toBeCloseTo(0.225)
  })
})

describe('outputFileName', () => {
  it('appends dimensions and maps the mime to an extension', () => {
    expect(outputFileName('photo.png', 'image/jpeg', { width: 800, height: 600 })).toBe(
      'photo-800x600.jpg',
    )
    expect(outputFileName('photo.jpeg', 'image/webp', { width: 10, height: 20 })).toBe(
      'photo-10x20.webp',
    )
  })

  it('handles names without an extension and with dots', () => {
    expect(outputFileName('scan', 'image/png', { width: 1, height: 1 })).toBe('scan-1x1.png')
    expect(outputFileName('my.holiday.photo.jpg', 'image/png', { width: 2, height: 2 })).toBe(
      'my.holiday.photo-2x2.png',
    )
  })

  it('falls back to the mime subtype for unknown formats', () => {
    expect(outputFileName('pic.bmp', 'image/avif', { width: 4, height: 4 })).toBe('pic-4x4.avif')
  })
})
