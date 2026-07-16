export type ResizeMode = 'fit' | 'crop-pad'
export type Unit = 'pt' | 'mm' | 'in'

export interface PagePreset {
  id: string
  label: string
  /** Portrait dimensions in PDF points (1 pt = 1/72 in). */
  width: number
  height: number
}

export const pagePresets: PagePreset[] = [
  { id: 'a3', label: 'A3', width: 841.89, height: 1190.55 },
  { id: 'a4', label: 'A4', width: 595.28, height: 841.89 },
  { id: 'a5', label: 'A5', width: 419.53, height: 595.28 },
  { id: 'letter', label: 'Letter', width: 612, height: 792 },
  { id: 'legal', label: 'Legal', width: 612, height: 1008 },
  { id: 'tabloid', label: 'Tabloid', width: 792, height: 1224 },
]

const POINTS_PER: Record<Unit, number> = { pt: 1, mm: 72 / 25.4, in: 72 }

export function toPoints(value: number, unit: Unit): number {
  return value * POINTS_PER[unit]
}

export function fromPoints(value: number, unit: Unit): number {
  return value / POINTS_PER[unit]
}

export interface TransformInput {
  srcWidth: number
  srcHeight: number
  /** Target page size in points, portrait or as entered. */
  targetWidth: number
  targetHeight: number
  mode: ResizeMode
  /** Swap target width/height per page so landscape pages stay landscape. */
  autoRotate: boolean
}

export interface PageTransform {
  /** Final page box size in points. */
  pageWidth: number
  pageHeight: number
  /** Uniform content scale (1 in crop/pad mode). */
  scale: number
  /** Content offset from the page's bottom-left corner; negative = cropped. */
  offsetX: number
  offsetY: number
}

/**
 * Compute the per-page transform. Content is always scaled uniformly
 * (never stretched) and centered; in crop/pad mode it keeps its original
 * size and is cropped or padded symmetrically.
 */
export function computeTransform(input: TransformInput): PageTransform {
  const { srcWidth, srcHeight, mode, autoRotate } = input
  let { targetWidth, targetHeight } = input

  const srcLandscape = srcWidth > srcHeight
  const targetLandscape = targetWidth > targetHeight
  if (autoRotate && targetWidth !== targetHeight && srcLandscape !== targetLandscape) {
    ;[targetWidth, targetHeight] = [targetHeight, targetWidth]
  }

  const scale = mode === 'fit' ? Math.min(targetWidth / srcWidth, targetHeight / srcHeight) : 1

  return {
    pageWidth: targetWidth,
    pageHeight: targetHeight,
    scale,
    offsetX: (targetWidth - srcWidth * scale) / 2,
    offsetY: (targetHeight - srcHeight * scale) / 2,
  }
}
