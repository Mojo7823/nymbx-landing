import { describe, expect, it } from 'vitest'
import {
  defaultSettings,
  downscaleFactor,
  effectiveLevel,
  effectiveQuality,
  outputName,
  resolveFormat,
  savingsPercent,
} from './compress'

describe('compressor helpers', () => {
  it('resolves same-as-input from extension or mime, falling back to WebP', () => {
    expect(resolveFormat('photo.jpg', 'image/jpeg', 'same')).toBe('jpeg')
    expect(resolveFormat('scan.PNG', 'image/png', 'same')).toBe('png')
    expect(resolveFormat('anim.webp', 'image/webp', 'same')).toBe('webp')
    expect(resolveFormat('pic.avif', 'image/avif', 'same')).toBe('avif')
    expect(resolveFormat('anim.gif', 'image/gif', 'same')).toBe('webp')
    expect(resolveFormat('noext', '', 'same')).toBe('webp')
    expect(resolveFormat('photo.jpg', 'image/jpeg', 'avif')).toBe('avif')
  })

  it('names outputs with a -compressed suffix and the right extension', () => {
    expect(outputName('photo.png', 'jpeg')).toBe('photo-compressed.jpg')
    expect(outputName('shot.jpg', 'avif')).toBe('shot-compressed.avif')
    expect(outputName('noext', 'webp')).toBe('noext-compressed.webp')
  })

  it('computes the longest-edge downscale factor', () => {
    expect(downscaleFactor(4000, 3000, 0)).toBe(1)
    expect(downscaleFactor(800, 600, 2048)).toBe(1)
    expect(downscaleFactor(4000, 3000, 2000)).toBe(0.5)
    expect(downscaleFactor(1000, 3000, 1500)).toBe(0.5)
    expect(downscaleFactor(0, 0, 1024)).toBe(1)
  })

  it('computes whole-percent savings, negative when the output grows', () => {
    expect(savingsPercent(1000, 250)).toBe(75)
    expect(savingsPercent(1000, 1500)).toBe(-50)
    expect(savingsPercent(0, 10)).toBe(0)
  })

  it('clamps quality and PNG effort into range', () => {
    expect(effectiveQuality(500)).toBe(100)
    expect(effectiveQuality(-3)).toBe(1)
    expect(effectiveQuality(70)).toBe(70)
    expect(effectiveLevel(99)).toBe(6)
    expect(effectiveLevel(0)).toBe(1)
  })

  it('defaults to same-format output at quality 70, original size', () => {
    expect(defaultSettings()).toEqual({
      format: 'same',
      quality: 70,
      pngLevel: 2,
      maxDimension: 0,
      flatten: '#ffffff',
    })
  })
})
