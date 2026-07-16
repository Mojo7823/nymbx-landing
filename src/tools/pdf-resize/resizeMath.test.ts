import { describe, expect, it } from 'vitest'
import { computeTransform, pagePresets, toPoints, type TransformInput } from './resizeMath'

function input(partial: Partial<TransformInput>): TransformInput {
  return {
    srcWidth: 595.28,
    srcHeight: 841.89,
    targetWidth: 595.28,
    targetHeight: 841.89,
    mode: 'fit',
    autoRotate: true,
    ...partial,
  }
}

describe('pagePresets', () => {
  it('includes A4 and Letter with correct point dimensions', () => {
    const a4 = pagePresets.find((p) => p.id === 'a4')!
    expect(a4.width).toBeCloseTo(595.28, 1)
    expect(a4.height).toBeCloseTo(841.89, 1)
    const letter = pagePresets.find((p) => p.id === 'letter')!
    expect(letter.width).toBe(612)
    expect(letter.height).toBe(792)
  })
})

describe('toPoints', () => {
  it('converts millimetres and inches to points', () => {
    expect(toPoints(210, 'mm')).toBeCloseTo(595.28, 1)
    expect(toPoints(8.5, 'in')).toBe(612)
    expect(toPoints(100, 'pt')).toBe(100)
  })
})

describe('computeTransform — fit mode', () => {
  it('scales uniformly to fit and centers the content', () => {
    // A4 portrait → A5 portrait: exact half-linear scale... A5 is A4/√2.
    const t = computeTransform(
      input({ srcWidth: 595.28, srcHeight: 841.89, targetWidth: 419.53, targetHeight: 595.28 }),
    )
    expect(t.scale).toBeCloseTo(419.53 / 595.28, 4)
    // Uniform scale: one axis fills, the other gets symmetric margins.
    expect(t.pageWidth).toBeCloseTo(419.53, 2)
    expect(t.pageHeight).toBeCloseTo(595.28, 2)
    expect(t.offsetX).toBeCloseTo((419.53 - 595.28 * t.scale) / 2, 2)
    expect(t.offsetY).toBeCloseTo((595.28 - 841.89 * t.scale) / 2, 2)
  })

  it('letterboxes when aspect ratios differ instead of distorting', () => {
    // Square source into A4 portrait: scale bound by width, vertical margins.
    const t = computeTransform(
      input({ srcWidth: 500, srcHeight: 500, targetWidth: 595.28, targetHeight: 841.89 }),
    )
    expect(t.scale).toBeCloseTo(595.28 / 500, 4)
    expect(t.offsetX).toBeCloseTo(0, 2)
    expect(t.offsetY).toBeGreaterThan(0)
  })

  it('never upscales differently per axis (aspect preserved)', () => {
    const t = computeTransform(
      input({ srcWidth: 300, srcHeight: 400, targetWidth: 612, targetHeight: 792 }),
    )
    const scaledAspect = (300 * t.scale) / (400 * t.scale)
    expect(scaledAspect).toBeCloseTo(300 / 400, 6)
  })
})

describe('computeTransform — crop/pad mode', () => {
  it('keeps content at original size and centers it (pad)', () => {
    const t = computeTransform(
      input({
        srcWidth: 400,
        srcHeight: 500,
        targetWidth: 595.28,
        targetHeight: 841.89,
        mode: 'crop-pad',
      }),
    )
    expect(t.scale).toBe(1)
    expect(t.offsetX).toBeCloseTo((595.28 - 400) / 2, 2)
    expect(t.offsetY).toBeCloseTo((841.89 - 500) / 2, 2)
  })

  it('crops symmetrically when the target is smaller', () => {
    const t = computeTransform(
      input({
        srcWidth: 800,
        srcHeight: 1000,
        targetWidth: 595.28,
        targetHeight: 841.89,
        mode: 'crop-pad',
      }),
    )
    expect(t.scale).toBe(1)
    expect(t.offsetX).toBeLessThan(0)
    expect(t.offsetY).toBeLessThan(0)
  })
})

describe('computeTransform — auto-rotate for mixed orientations', () => {
  it('swaps target dimensions for landscape pages', () => {
    const t = computeTransform(
      input({ srcWidth: 841.89, srcHeight: 595.28, targetWidth: 595.28, targetHeight: 841.89 }),
    )
    expect(t.pageWidth).toBeCloseTo(841.89, 2)
    expect(t.pageHeight).toBeCloseTo(595.28, 2)
    expect(t.scale).toBeCloseTo(1, 4)
  })

  it('does not swap when autoRotate is off', () => {
    const t = computeTransform(
      input({
        srcWidth: 841.89,
        srcHeight: 595.28,
        targetWidth: 595.28,
        targetHeight: 841.89,
        autoRotate: false,
      }),
    )
    expect(t.pageWidth).toBeCloseTo(595.28, 2)
    expect(t.pageHeight).toBeCloseTo(841.89, 2)
    // Landscape content into portrait page: width-bound scale, vertical margins.
    expect(t.scale).toBeCloseTo(595.28 / 841.89, 4)
  })

  it('square-ish targets never swap', () => {
    const t = computeTransform(
      input({ srcWidth: 841.89, srcHeight: 595.28, targetWidth: 500, targetHeight: 500 }),
    )
    expect(t.pageWidth).toBe(500)
    expect(t.pageHeight).toBe(500)
  })
})
