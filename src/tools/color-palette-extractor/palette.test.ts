import { describe, expect, it } from 'vitest'
import {
  bestTextOn,
  buildPaletteCss,
  buildPaletteText,
  contrastLevel,
  contrastRatio,
  extractPalette,
  formatColor,
  formatHsl,
  formatRgb,
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  suggestContrastPairs,
  type PaletteColor,
} from './palette'

function rgba(pixels: Array<[number, number, number, number?]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b, a = 255], i) => {
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = b
    out[i * 4 + 3] = a
  })
  return out
}

function solid(count: number, rgb: [number, number, number]): Uint8ClampedArray {
  return rgba(Array.from({ length: count }, () => rgb))
}

const BLACK: PaletteColor = {
  rgb: { r: 0, g: 0, b: 0 },
  hex: '#000000',
  hsl: { h: 0, s: 0, l: 0 },
  population: 1,
  share: 0.5,
}
const WHITE: PaletteColor = {
  rgb: { r: 255, g: 255, b: 255 },
  hex: '#ffffff',
  hsl: { h: 0, s: 0, l: 100 },
  population: 1,
  share: 0.5,
}

describe('color conversions', () => {
  it('converts primary colors to hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000')
    expect(rgbToHex(0, 0, 0)).toBe('#000000')
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff')
  })

  it('parses 6- and 3-digit hex with or without a hash', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb('00ff00')).toEqual({ r: 0, g: 255, b: 0 })
    expect(hexToRgb('#0f0')).toEqual({ r: 0, g: 255, b: 0 })
    expect(() => hexToRgb('nope')).toThrow(/invalid hex/i)
  })

  it('round-trips hex through rgb', () => {
    for (const hex of ['#123456', '#abcdef', '#000000', '#ffffff']) {
      const rgb = hexToRgb(hex)
      expect(rgbToHex(rgb.r, rgb.g, rgb.b)).toBe(hex)
    }
  })

  it('converts primaries to hsl', () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 100, l: 50 })
    expect(rgbToHsl(255, 255, 255)).toEqual({ h: 0, s: 0, l: 100 })
    expect(rgbToHsl(0, 0, 0)).toEqual({ h: 0, s: 0, l: 0 })
  })

  it('formats rgb/hsl strings that parse as CSS', () => {
    expect(formatRgb({ r: 1, g: 2, b: 3 })).toBe('rgb(1, 2, 3)')
    expect(formatHsl({ h: 210, s: 50, l: 40 })).toBe('hsl(210, 50%, 40%)')
    expect(formatColor(BLACK, 'hex')).toBe('#000000')
  })
})

describe('contrast math', () => {
  it('scores black-on-white at 21:1 and identical colors at 1:1', () => {
    expect(contrastRatio(BLACK.rgb, WHITE.rgb)).toBe(21)
    expect(contrastRatio(BLACK.rgb, BLACK.rgb)).toBe(1)
  })

  it('labels WCAG levels at the 3 / 4.5 / 7 boundaries', () => {
    expect(contrastLevel(21)).toBe('AAA')
    expect(contrastLevel(4.5)).toBe('AA')
    expect(contrastLevel(3)).toBe('AA large')
    expect(contrastLevel(2.99)).toBe('fail')
  })

  it('picks white text on dark swatches and black text on light ones', () => {
    expect(bestTextOn(BLACK.rgb)).toBe('#ffffff')
    expect(bestTextOn(WHITE.rgb)).toBe('#000000')
  })
})

describe('extractPalette', () => {
  it('returns nothing for empty or fully transparent input', () => {
    expect(extractPalette(new Uint8ClampedArray(0))).toEqual([])
    expect(extractPalette(rgba([[255, 0, 0, 0]]))).toEqual([])
  })

  it('collapses a solid image to one swatch with full share', () => {
    const palette = extractPalette(solid(64, [18, 52, 86]), { colorCount: 6 })
    expect(palette).toHaveLength(1)
    expect(palette[0]!.hex).toBe('#123456')
    expect(palette[0]!.share).toBe(1)
  })

  it('finds both halves of a red/green split', () => {
    const pixels = rgba([
      ...Array.from({ length: 50 }, () => [255, 0, 0] as [number, number, number]),
      ...Array.from({ length: 50 }, () => [0, 128, 0] as [number, number, number]),
    ])
    const palette = extractPalette(pixels, { colorCount: 2 })
    expect(palette.map((c) => c.hex).sort()).toEqual(['#008000', '#ff0000'])
  })

  it('ignores transparent pixels', () => {
    const pixels = rgba([
      [255, 0, 0, 0],
      [0, 0, 255],
      [0, 0, 255],
    ])
    const palette = extractPalette(pixels, { colorCount: 4 })
    expect(palette).toHaveLength(1)
    expect(palette[0]!.hex).toBe('#0000ff')
  })

  it('is deterministic across runs and orders by population', () => {
    const pixels = rgba([
      ...Array.from({ length: 60 }, () => [200, 30, 30] as [number, number, number]),
      ...Array.from({ length: 30 }, () => [30, 200, 30] as [number, number, number]),
      ...Array.from({ length: 10 }, () => [30, 30, 200] as [number, number, number]),
    ])
    const first = extractPalette(pixels, { colorCount: 3 })
    const second = extractPalette(pixels, { colorCount: 3 })
    expect(second).toEqual(first)
    expect(first[0]!.population).toBeGreaterThanOrEqual(first[1]!.population)
    const shares = first.reduce((sum, c) => sum + c.share, 0)
    expect(shares).toBeCloseTo(1, 10)
  })

  it('never returns more swatches than requested', () => {
    const pixels = rgba(
      Array.from(
        { length: 300 },
        (_, i) => [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256] as [number, number, number],
      ),
    )
    expect(extractPalette(pixels, { colorCount: 5 })).toHaveLength(5)
  })
})

describe('pairs and export', () => {
  it('suggests the black/white pair at 21:1 with darker side first', () => {
    const pairs = suggestContrastPairs([WHITE, BLACK])
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toMatchObject({ ratio: 21, level: 'AAA' })
    expect(pairs[0]!.foreground.hex).toBe('#000000')
  })

  it('drops pairs below the minimum ratio', () => {
    const gray: PaletteColor = {
      rgb: { r: 120, g: 120, b: 120 },
      hex: '#787878',
      hsl: { h: 0, s: 0, l: 47 },
      population: 1,
      share: 0.5,
    }
    expect(suggestContrastPairs([gray, { ...gray, hex: '#7a7a7a' }])).toEqual([])
  })

  it('builds CSS variables and plain-text exports', () => {
    expect(buildPaletteCss([BLACK, WHITE])).toBe(
      ':root {\n  --color-1: #000000;\n  --color-2: #ffffff;\n}\n',
    )
    expect(buildPaletteText([BLACK, WHITE], 'hex')).toBe('#000000\n#ffffff\n')
    expect(buildPaletteText([BLACK], 'rgb')).toBe('rgb(0, 0, 0)\n')
  })
})
