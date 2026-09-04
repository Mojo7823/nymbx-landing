/** Pure helpers for the image format converter: formats, naming, size math. */

export type OutputFormat = 'png' | 'jpeg' | 'webp' | 'avif'
export type FlattenColor = '#ffffff' | '#000000'

export interface FormatDef {
  id: OutputFormat
  label: string
  ext: string
  mime: string
  /** Null for lossless formats (no quality slider). */
  quality: { min: number; max: number; def: number } | null
  blurb: string
}

export const FORMATS: Record<OutputFormat, FormatDef> = {
  png: {
    id: 'png',
    label: 'PNG',
    ext: 'png',
    mime: 'image/png',
    quality: null,
    blurb: 'Lossless. Keeps transparency exactly.',
  },
  jpeg: {
    id: 'jpeg',
    label: 'JPEG',
    ext: 'jpg',
    mime: 'image/jpeg',
    quality: { min: 1, max: 100, def: 80 },
    blurb: 'Small photos. No transparency — see flatten option.',
  },
  webp: {
    id: 'webp',
    label: 'WebP',
    ext: 'webp',
    mime: 'image/webp',
    quality: { min: 1, max: 100, def: 80 },
    blurb: 'Modern and compact. Keeps transparency.',
  },
  avif: {
    id: 'avif',
    label: 'AVIF',
    ext: 'avif',
    mime: 'image/avif',
    quality: { min: 1, max: 100, def: 50 },
    blurb: 'Smallest files, slowest encode. Keeps transparency.',
  },
}

export const FORMAT_ORDER: OutputFormat[] = ['png', 'jpeg', 'webp', 'avif']

export const FLATTEN_LABELS: Record<FlattenColor, string> = {
  '#ffffff': 'White background',
  '#000000': 'Black background',
}

/** `photo.png` → `photo.jpg` for the target format (handles extensionless names). */
export function outputName(inputName: string, format: OutputFormat): string {
  const stem = inputName.replace(/\.[^.]+$/, '') || 'image'
  return `${stem}.${FORMATS[format].ext}`
}

/** Whole-percent savings of `outputBytes` vs `inputBytes` (negative = grew). */
export function savingsPercent(inputBytes: number, outputBytes: number): number {
  if (inputBytes <= 0) return 0
  return Math.round((1 - outputBytes / inputBytes) * 100)
}

/**
 * True when any pixel is actually transparent. A PNG can carry an alpha
 * channel that is fully opaque — only a real transparent pixel forces the
 * flatten warning for JPEG output.
 */
export function hasTransparency(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! < 255) return true
  }
  return false
}

export interface ConvertSettings {
  format: OutputFormat
  quality: number
  flatten: FlattenColor
}

export function defaultSettings(): ConvertSettings {
  return { format: 'webp', quality: 80, flatten: '#ffffff' }
}

/** Quality actually sent to the encoder (PNG ignores it). */
export function effectiveQuality(settings: ConvertSettings): number {
  const def = FORMATS[settings.format].quality
  if (!def) return 100
  return Math.min(def.max, Math.max(def.min, Math.round(settings.quality)))
}
