import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BLOCK,
  MAX_BLOCK,
  MIN_BLOCK,
  clampBlock,
  pixelateInPlace,
  hardenAlpha,
} from './pixelate'

/** Build RGBA data from a per-pixel colour function. */
function makeData(
  width: number,
  height: number,
  color: (x: number, y: number) => [number, number, number, number],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = color(x, y)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = a
    }
  }
  return data
}

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const i = (y * width + x) * 4
  return [data[i], data[i + 1], data[i + 2], data[i + 3]]
}

/** Reference mean over the rectangle [x0,x0+w) × [y0,y0+h). */
function meanOf(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): number[] {
  const sums = [0, 0, 0, 0]
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * width + x) * 4
      for (let c = 0; c < 4; c++) sums[c] += data[i + c]
    }
  }
  return sums.map((s) => Math.round(s / (w * h)))
}

describe('clampBlock', () => {
  it('clamps to the guaranteed range and floors fractions', () => {
    expect(clampBlock(1)).toBe(MIN_BLOCK)
    expect(clampBlock(0)).toBe(MIN_BLOCK)
    expect(clampBlock(-40)).toBe(MIN_BLOCK)
    expect(clampBlock(7.9)).toBe(MIN_BLOCK)
    expect(clampBlock(16)).toBe(16)
    expect(clampBlock(16.7)).toBe(16)
    expect(clampBlock(1000)).toBe(MAX_BLOCK)
    expect(clampBlock(Number.NaN)).toBe(DEFAULT_BLOCK)
  })
})

describe('pixelateInPlace', () => {
  it('replaces each full cell with the mean of that cell', () => {
    const width = 32
    const height = 16
    // A gradient makes every cell mean distinct.
    const original = makeData(width, height, (x, y) => [x * 4, y * 8, (x + y) * 3, 255])
    const data = new Uint8ClampedArray(original)
    pixelateInPlace(data, width, height, 8)

    for (let cy = 0; cy < height; cy += 8) {
      for (let cx = 0; cx < width; cx += 8) {
        const expected = meanOf(original, width, cx, cy, 8, 8)
        for (let y = cy; y < cy + 8; y++) {
          for (let x = cx; x < cx + 8; x++) {
            expect(pixel(data, width, x, y)).toEqual(expected)
          }
        }
      }
    }
  })

  it('averages partial edge cells over the pixels they cover', () => {
    const width = 20 // 16 + a 4-wide partial column
    const height = 19 // 16 + a 3-tall partial row
    const original = makeData(width, height, (x, y) => [x * 10, y * 10, 7, 255])
    const data = new Uint8ClampedArray(original)
    pixelateInPlace(data, width, height, 16)

    // Partial right column: x 16..19, y 0..15
    expect(pixel(data, width, 16, 0)).toEqual(meanOf(original, width, 16, 0, 4, 16))
    expect(pixel(data, width, 19, 15)).toEqual(meanOf(original, width, 16, 0, 4, 16))
    // Partial bottom row: x 0..15, y 16..18
    expect(pixel(data, width, 0, 16)).toEqual(meanOf(original, width, 0, 16, 16, 3))
    // Bottom-right corner cell: 4 × 3
    expect(pixel(data, width, 18, 17)).toEqual(meanOf(original, width, 16, 16, 4, 3))
  })

  it('leaves every cell uniform, so nothing of the original detail survives', () => {
    const width = 41
    const height = 37
    const data = makeData(width, height, (x, y) => [(x * 7919) % 256, (y * 6151) % 256, 0, 255])
    pixelateInPlace(data, width, height, 8)

    for (let cy = 0; cy < height; cy += 8) {
      for (let cx = 0; cx < width; cx += 8) {
        const first = pixel(data, width, cx, cy)
        for (let y = cy; y < Math.min(cy + 8, height); y++) {
          for (let x = cx; x < Math.min(cx + 8, width); x++) {
            expect(pixel(data, width, x, y)).toEqual(first)
          }
        }
      }
    }
  })

  it('averages the alpha channel too', () => {
    const width = 8
    const height = 8
    // Half opaque, half transparent → mean alpha 128.
    const data = makeData(width, height, (x) => [10, 20, 30, x < 4 ? 0 : 255])
    pixelateInPlace(data, width, height, 8)
    expect(pixel(data, width, 0, 0)).toEqual([10, 20, 30, 128])
    expect(pixel(data, width, 7, 7)).toEqual([10, 20, 30, 128])
  })

  it('clamps the block size to at least 8', () => {
    const width = 16
    const height = 8
    const original = makeData(width, height, (x) => [x * 16, 0, 0, 255])
    const asked1 = new Uint8ClampedArray(original)
    const asked8 = new Uint8ClampedArray(original)
    pixelateInPlace(asked1, width, height, 1)
    pixelateInPlace(asked8, width, height, 8)
    expect([...asked1]).toEqual([...asked8])
    // Two distinct 8-wide cells, each uniform.
    expect(pixel(asked1, width, 0, 0)).toEqual(meanOf(original, width, 0, 0, 8, 8))
    expect(pixel(asked1, width, 8, 0)).toEqual(meanOf(original, width, 8, 0, 8, 8))
  })

  it('is deterministic and idempotent for a full-cell grid', () => {
    const width = 32
    const height = 32
    const base = makeData(width, height, (x, y) => [x * 3, y * 5, (x * y) % 256, 200])
    const once = new Uint8ClampedArray(base)
    pixelateInPlace(once, width, height, 16)
    const twice = new Uint8ClampedArray(once)
    pixelateInPlace(twice, width, height, 16)
    expect([...twice]).toEqual([...once])

    const again = new Uint8ClampedArray(base)
    pixelateInPlace(again, width, height, 16)
    expect([...again]).toEqual([...once])
  })

  it('does nothing for an empty buffer', () => {
    const data = new Uint8ClampedArray(0)
    expect(() => pixelateInPlace(data, 0, 0, 16)).not.toThrow()
  })
})

describe('hardenAlpha', () => {
  it('snaps every alpha to 0 or 255 around the threshold and blacks the colour', () => {
    const data = new Uint8ClampedArray([
      10, 20, 30, 0, 40, 50, 60, 127, 70, 80, 90, 128, 1, 2, 3, 255,
    ])
    hardenAlpha(data)
    expect(Array.from(data)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255])
  })
})
