import { describe, expect, it } from 'vitest'
import {
  defaultSettings,
  effectiveQuality,
  FORMATS,
  hasTransparency,
  outputName,
  savingsPercent,
} from './converter'

describe('format converter helpers', () => {
  it('maps every planned format with matching ext and mime', () => {
    expect(Object.keys(FORMATS).sort()).toEqual(['avif', 'jpeg', 'png', 'webp'])
    expect(FORMATS.jpeg).toMatchObject({ ext: 'jpg', mime: 'image/jpeg' })
    expect(FORMATS.png).toMatchObject({ ext: 'png', mime: 'image/png' })
    expect(FORMATS.webp).toMatchObject({ ext: 'webp', mime: 'image/webp' })
    expect(FORMATS.avif).toMatchObject({ ext: 'avif', mime: 'image/avif' })
  })

  it('only lossless PNG skips the quality slider', () => {
    expect(FORMATS.png.quality).toBeNull()
    for (const id of ['jpeg', 'webp', 'avif'] as const) {
      expect(FORMATS[id].quality).not.toBeNull()
    }
  })

  it('renames outputs to the target extension', () => {
    expect(outputName('photo.png', 'jpeg')).toBe('photo.jpg')
    expect(outputName('shot.HEIC', 'avif')).toBe('shot.avif')
    expect(outputName('noext', 'webp')).toBe('noext.webp')
    expect(outputName('.hidden', 'png')).toBe('image.png')
  })

  it('computes whole-percent savings, negative when the output grows', () => {
    expect(savingsPercent(1000, 250)).toBe(75)
    expect(savingsPercent(1000, 1500)).toBe(-50)
    expect(savingsPercent(0, 10)).toBe(0)
  })

  it('detects real transparency but not a fully opaque alpha channel', () => {
    const opaque = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255])
    expect(hasTransparency(opaque)).toBe(false)
    const seethrough = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0])
    expect(hasTransparency(seethrough)).toBe(true)
  })

  it('clamps quality into each format range and ignores it for PNG', () => {
    expect(effectiveQuality({ ...defaultSettings(), format: 'jpeg', quality: 500 })).toBe(100)
    expect(effectiveQuality({ ...defaultSettings(), format: 'jpeg', quality: -3 })).toBe(1)
    expect(effectiveQuality({ ...defaultSettings(), format: 'png', quality: 1 })).toBe(100)
  })

  it('defaults to a sensible first-run configuration', () => {
    expect(defaultSettings()).toEqual({ format: 'webp', quality: 80, flatten: '#ffffff' })
  })
})
