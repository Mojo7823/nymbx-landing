import { describe, expect, it } from 'vitest'
import { ASPECT_PRESETS, centeredRect, clampCrop, outputName, rotatedSize, scaleRect } from './crop'

describe('crop geometry', () => {
  it('offers the planned aspect presets including passport size', () => {
    const ids = ASPECT_PRESETS.map((p) => p.id)
    expect(ids).toEqual(['free', '1:1', '4:3', '3:2', '16:9', '9:16', 'passport'])
    expect(ASPECT_PRESETS.find((p) => p.id === 'passport')?.ratio).toBeCloseTo(35 / 45, 10)
  })

  it('clamps crop rects into bounds with whole pixels', () => {
    expect(clampCrop({ x: -5, y: -5, width: 200, height: 200 }, 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
    expect(clampCrop({ x: 90, y: 90, width: 50, height: 50 }, 100, 100)).toEqual({
      x: 50,
      y: 50,
      width: 50,
      height: 50,
    })
    expect(clampCrop({ x: 10.6, y: 10.4, width: 30.5, height: 30.5 }, 100, 100)).toEqual({
      x: 11,
      y: 10,
      width: 31,
      height: 31,
    })
  })

  it('computes rotated bounding boxes for right angles and fine angles', () => {
    expect(rotatedSize(100, 200, 90)).toEqual({ width: 200, height: 100 })
    expect(rotatedSize(100, 200, 180)).toEqual({ width: 100, height: 200 })
    expect(rotatedSize(100, 200, 0)).toEqual({ width: 100, height: 200 })
    const tilted = rotatedSize(100, 100, 45)
    expect(tilted).toEqual({ width: 142, height: 142 })
    expect(rotatedSize(100, 200, -90)).toEqual({ width: 200, height: 100 })
  })

  it('centers aspect crops and fills the frame for free-form', () => {
    expect(centeredRect(400, 300, null)).toEqual({ x: 0, y: 0, width: 400, height: 300 })
    expect(centeredRect(400, 300, 1)).toEqual({ x: 50, y: 0, width: 300, height: 300 })
    expect(centeredRect(300, 400, 16 / 9)).toEqual({ x: 0, y: 116, width: 300, height: 169 })
  })

  it('scales rects between frame sizes', () => {
    expect(scaleRect({ x: 10, y: 20, width: 30, height: 40 }, 100, 100, 200, 200)).toEqual({
      x: 20,
      y: 40,
      width: 60,
      height: 80,
    })
  })

  it('names cropped outputs after the input with the right extension', () => {
    expect(outputName('photo.png', false)).toBe('photo-cropped.png')
    expect(outputName('photo.png', true)).toBe('photo-cropped.jpg')
    expect(outputName('noext', false)).toBe('noext-cropped.png')
  })
})
