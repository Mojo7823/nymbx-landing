/** Pure helpers for the image compressor: settings, sizing, naming. */

export type CompressFormat = 'same' | 'png' | 'jpeg' | 'webp' | 'avif'
export type LossyFormat = 'jpeg' | 'webp' | 'avif'
export type FlattenColor = '#ffffff' | '#000000'

export const FORMAT_LABELS: Record<CompressFormat, string> = {
  same: 'Same as input',
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
  avif: 'AVIF',
}

export const FORMAT_ORDER: CompressFormat[] = ['same', 'jpeg', 'webp', 'avif', 'png']

/** 0 keeps original dimensions; otherwise the longest edge is capped here. */
export const MAX_DIMENSION_OPTIONS = [0, 4096, 3072, 2048, 1920, 1280, 1024] as const

export const MAX_DIMENSION_LABELS: Record<number, string> = {
  0: 'Original size',
  1024: '1024 px',
  1280: '1280 px',
  1920: '1920 px',
  2048: '2048 px',
  3072: '3072 px',
  4096: '4096 px',
}

export const FLATTEN_LABELS: Record<FlattenColor, string> = {
  '#ffffff': 'White background',
  '#000000': 'Black background',
}

export interface CompressSettings {
  format: CompressFormat
  /** 1–100 for JPEG/WebP/AVIF. */
  quality: number
  /** Oxipng effort 1–6 for PNG output. */
  pngLevel: number
  maxDimension: number
  flatten: FlattenColor
}

export function defaultSettings(): CompressSettings {
  return { format: 'same', quality: 70, pngLevel: 2, maxDimension: 0, flatten: '#ffffff' }
}

const EXT_TO_FORMAT: Record<string, LossyFormat | 'png'> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
}

/**
 * Resolve the concrete output format. Exotic inputs (GIF, BMP, …) fall back
 * to WebP rather than failing.
 */
export function resolveFormat(
  fileName: string,
  mime: string,
  selection: CompressFormat,
): LossyFormat | 'png' {
  if (selection !== 'same') return selection
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  const byExt = EXT_TO_FORMAT[ext]
  if (byExt) return byExt
  if (mime === 'image/jpeg') return 'jpeg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/avif') return 'avif'
  return 'webp'
}

export const OUTPUT_EXT: Record<LossyFormat | 'png', string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
}

/** `photo.png` → `photo-compressed.jpg` for the resolved format. */
export function outputName(inputName: string, format: LossyFormat | 'png'): string {
  const stem = inputName.replace(/\.[^.]+$/, '') || 'image'
  return `${stem}-compressed.${OUTPUT_EXT[format]}`
}

/** Scale that caps the longest edge at `maxDimension` (1 = no scaling). */
export function downscaleFactor(width: number, height: number, maxDimension: number): number {
  if (maxDimension <= 0) return 1
  const longest = Math.max(width, height)
  if (longest <= maxDimension || longest <= 0) return 1
  return maxDimension / longest
}

/** Whole-percent savings of `outputBytes` vs `inputBytes` (negative = grew). */
export function savingsPercent(inputBytes: number, outputBytes: number): number {
  if (inputBytes <= 0) return 0
  return Math.round((1 - outputBytes / inputBytes) * 100)
}

/** Quality actually sent to lossy encoders. */
export function effectiveQuality(quality: number): number {
  return Math.min(100, Math.max(1, Math.round(quality)))
}

/** Oxipng effort actually sent (docs advise against going above 4). */
export function effectiveLevel(level: number): number {
  return Math.min(6, Math.max(1, Math.round(level)))
}
