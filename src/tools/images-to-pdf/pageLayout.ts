export type PageMode = 'fit' | 'a4' | 'letter'

/** CSS pixels → PDF points (96 px/in → 72 pt/in). */
export const PT_PER_PX = 72 / 96

/** Margin around the image on fixed-size pages (0.5 in). */
export const PAGE_MARGIN_PT = 36

const FIXED_PAGES: Record<Exclude<PageMode, 'fit'>, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
}

export interface PagePlacement {
  pageWidth: number
  pageHeight: number
  /** Placement rect of the displayed image, PDF coordinates (origin bottom-left). */
  x: number
  y: number
  width: number
  height: number
}

/**
 * Page size and centered placement for an image of `width` × `height` display
 * pixels. Fixed pages turn landscape for landscape images and fit the image
 * (scaled up or down) inside the margins, preserving aspect ratio.
 */
export function placeOnPage(width: number, height: number, mode: PageMode): PagePlacement {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  if (mode === 'fit') {
    const pageWidth = w * PT_PER_PX
    const pageHeight = h * PT_PER_PX
    return { pageWidth, pageHeight, x: 0, y: 0, width: pageWidth, height: pageHeight }
  }
  const base = FIXED_PAGES[mode]
  const landscape = w > h
  const pageWidth = landscape ? base.height : base.width
  const pageHeight = landscape ? base.width : base.height
  const scale = Math.min(
    (pageWidth - 2 * PAGE_MARGIN_PT) / w,
    (pageHeight - 2 * PAGE_MARGIN_PT) / h,
  )
  const drawWidth = w * scale
  const drawHeight = h * scale
  return {
    pageWidth,
    pageHeight,
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  }
}

/** EXIF orientations whose displayed width/height are the stored ones swapped. */
export function swapsDimensions(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8
}

/** EXIF orientations that mirror the image — rotation alone cannot display them. */
export function isMirrored(orientation: number): boolean {
  return orientation === 2 || orientation === 4 || orientation === 5 || orientation === 7
}

export interface RotatedDraw {
  x: number
  y: number
  width: number
  height: number
  /** Counter-clockwise rotation for pdf-lib `degrees()`. */
  rotate: number
}

/**
 * drawImage arguments that render the stored image bytes upright inside the
 * display rect, for the pure-rotation EXIF orientations. pdf-lib rotates
 * counter-clockwise around (x, y), so the anchor shifts to keep the rotated
 * result exactly inside `rect`.
 */
export function rotatedDraw(
  orientation: 1 | 3 | 6 | 8,
  rect: { x: number; y: number; width: number; height: number },
): RotatedDraw {
  switch (orientation) {
    case 1:
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, rotate: 0 }
    case 3: // stored upside down
      return {
        x: rect.x + rect.width,
        y: rect.y + rect.height,
        width: rect.width,
        height: rect.height,
        rotate: 180,
      }
    case 6: // displays correctly when rotated 90° clockwise
      return {
        x: rect.x,
        y: rect.y + rect.height,
        width: rect.height,
        height: rect.width,
        rotate: -90,
      }
    case 8: // displays correctly when rotated 90° counter-clockwise
      return {
        x: rect.x + rect.width,
        y: rect.y,
        width: rect.height,
        height: rect.width,
        rotate: 90,
      }
  }
}
