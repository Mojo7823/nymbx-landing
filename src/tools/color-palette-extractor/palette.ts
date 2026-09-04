/**
 * Pure color math + deterministic median-cut palette extraction.
 *
 * No DOM here so the whole module runs in Vitest and inside the tool's
 * Web Worker (see `palette.worker.ts`). The UI downsamples the image to a
 * small analysis bitmap first; this module only ever sees raw RGBA pixels.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsl {
  /** 0–359 */
  h: number
  /** 0–100 */
  s: number
  /** 0–100 */
  l: number
}

export interface PaletteColor {
  rgb: Rgb
  hex: string
  hsl: Hsl
  /** Pixels in this bucket (after deterministic subsampling). */
  population: number
  /** population / total sampled opaque pixels, 0–1. */
  share: number
}

export type ColorFormat = 'hex' | 'rgb' | 'hsl'

/** Cap on sampled pixels per extraction — bounds the worker sort cost. */
export const MAX_SAMPLES_DEFAULT = 20_000

/** Alpha below this is treated as transparent and ignored. */
export const ALPHA_CUTOFF = 128

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(255, Math.max(0, Math.round(n)))
}

function toHexByte(n: number): string {
  return clampByte(n).toString(16).padStart(2, '0')
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
}

export function rgbToHexString({ r, g, b }: Rgb): string {
  return rgbToHex(r, g, b)
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.trim().replace(/^#/, '')
  const expanded =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) throw new Error('Invalid hex color.')
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  }
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = clampByte(r) / 255
  const gn = clampByte(g) / 255
  const bn = clampByte(b) / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function formatRgb({ r, g, b }: Rgb): string {
  return `rgb(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)})`
}

export function formatHsl({ h, s, l }: Hsl): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

export function formatColor(color: PaletteColor, format: ColorFormat): string {
  if (format === 'rgb') return formatRgb(color.rgb)
  if (format === 'hsl') return formatHsl(color.hsl)
  return color.hex
}

/** WCAG 2.1 relative luminance, 0–1. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const linear = (c: number): number => {
    const s = clampByte(c) / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG contrast ratio, 1–21, rounded to two decimals. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}

export type ContrastLevel = 'AAA' | 'AA' | 'AA large' | 'fail'

export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA large'
  return 'fail'
}

/** Readable text on top of `rgb`: whichever of white/black contrasts more. */
export function bestTextOn(rgb: Rgb): '#ffffff' | '#000000' {
  const white = contrastRatio(rgb, { r: 255, g: 255, b: 255 })
  const black = contrastRatio(rgb, { r: 0, g: 0, b: 0 })
  return white > black ? '#ffffff' : '#000000'
}

type Pixel = [number, number, number]

function widestChannel(box: Pixel[]): { channel: 0 | 1 | 2; range: number } {
  const mins: [number, number, number] = [255, 255, 255]
  const maxs: [number, number, number] = [0, 0, 0]
  for (const p of box) {
    for (let c = 0 as 0 | 1 | 2; c < 3; c = (c + 1) as 0 | 1 | 2) {
      const v = p[c] ?? 0
      if (v < mins[c]) mins[c] = v
      if (v > maxs[c]) maxs[c] = v
    }
  }
  const ranges = [maxs[0]! - mins[0]!, maxs[1]! - mins[1]!, maxs[2]! - mins[2]!]
  // First-max wins, so ties resolve R → G → B deterministically.
  let channel: 0 | 1 | 2 = 0
  if (ranges[1]! > ranges[channel]!) channel = 1
  if (ranges[2]! > ranges[channel]!) channel = 2
  return { channel, range: ranges[channel]! }
}

function averageColor(box: Pixel[]): Rgb {
  let r = 0
  let g = 0
  let b = 0
  for (const p of box) {
    r += p[0] ?? 0
    g += p[1] ?? 0
    b += p[2] ?? 0
  }
  const n = Math.max(1, box.length)
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}

export interface ExtractOptions {
  /** 1–12, defaults to 6. */
  colorCount?: number
  /** Upper bound on sampled pixels, defaults to 20 000. */
  maxSamples?: number
}

/**
 * Median-cut palette extraction over raw RGBA bytes.
 *
 * Deterministic: same input bytes + same options always yield the same
 * palette in the same order (population desc, hex asc as tie-break).
 * Fully transparent pixels (alpha < 128) are ignored.
 */
export function extractPalette(
  rgba: Uint8ClampedArray | Uint8Array,
  options?: ExtractOptions,
): PaletteColor[] {
  const colorCount = Math.min(12, Math.max(1, Math.round(options?.colorCount ?? 6)))
  const maxSamples = Math.max(1, Math.round(options?.maxSamples ?? MAX_SAMPLES_DEFAULT))
  const totalPixels = Math.floor(rgba.length / 4)
  if (totalPixels === 0) return []

  const stride = Math.max(1, Math.ceil(totalPixels / maxSamples))
  const samples: Pixel[] = []
  for (let i = 0; i < totalPixels; i += stride) {
    const alpha = rgba[i * 4 + 3] ?? 255
    if (alpha < ALPHA_CUTOFF) continue
    samples.push([rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0])
  }
  if (samples.length === 0) return []

  let boxes: Pixel[][] = [samples]
  while (boxes.length < colorCount) {
    let best = -1
    let bestScore = -1
    let bestChannel: 0 | 1 | 2 = 0
    boxes.forEach((box, index) => {
      if (box.length < 2) return
      const { channel, range } = widestChannel(box)
      if (range === 0) return
      const score = range * box.length
      if (score > bestScore) {
        bestScore = score
        best = index
        bestChannel = channel
      }
    })
    if (best === -1) break
    const box = boxes[best]!
    const sorted = [...box].sort((p, q) => (p[bestChannel] ?? 0) - (q[bestChannel] ?? 0))
    const mid = Math.floor(sorted.length / 2)
    boxes = [
      ...boxes.slice(0, best),
      sorted.slice(0, mid),
      sorted.slice(mid),
      ...boxes.slice(best + 1),
    ]
  }

  const total = samples.length
  return boxes
    .map((box) => {
      const rgb = averageColor(box)
      return {
        rgb,
        hex: rgbToHexString(rgb),
        hsl: rgbToHsl(rgb.r, rgb.g, rgb.b),
        population: box.length,
        share: box.length / total,
      } satisfies PaletteColor
    })
    .sort((a, b) => b.population - a.population || (a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0))
}

export interface ContrastPair {
  /** Darker side — the suggested text color. */
  foreground: PaletteColor
  /** Lighter side — the suggested background. */
  background: PaletteColor
  ratio: number
  level: ContrastLevel
}

/**
 * Suggest readable foreground/background pairs from within the palette.
 * Only pairs meeting at least large-text contrast (≥ 3:1) are returned,
 * strongest first. Deterministic for a given palette.
 */
export function suggestContrastPairs(
  palette: PaletteColor[],
  options?: { minRatio?: number; limit?: number },
): ContrastPair[] {
  const minRatio = options?.minRatio ?? 3
  const limit = Math.max(1, Math.round(options?.limit ?? 8))
  const pairs: ContrastPair[] = []
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const a = palette[i]!
      const b = palette[j]!
      const ratio = contrastRatio(a.rgb, b.rgb)
      if (ratio < minRatio) continue
      const aLum = relativeLuminance(a.rgb)
      const bLum = relativeLuminance(b.rgb)
      const [foreground, background] = aLum <= bLum ? [a, b] : [b, a]
      pairs.push({ foreground, background, ratio, level: contrastLevel(ratio) })
    }
  }
  return pairs
    .sort(
      (x, y) =>
        y.ratio - x.ratio ||
        (x.foreground.hex < y.foreground.hex
          ? -1
          : x.foreground.hex > y.foreground.hex
            ? 1
            : x.background.hex < y.background.hex
              ? -1
              : x.background.hex > y.background.hex
                ? 1
                : 0),
    )
    .slice(0, limit)
}

export function buildPaletteCss(palette: PaletteColor[], prefix = '--color'): string {
  const lines = palette.map((c, i) => `  ${prefix}-${i + 1}: ${c.hex};`)
  return `:root {\n${lines.join('\n')}\n}\n`
}

export function buildPaletteText(palette: PaletteColor[], format: ColorFormat): string {
  return `${palette.map((c) => formatColor(c, format)).join('\n')}\n`
}
