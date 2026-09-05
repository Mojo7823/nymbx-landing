/**
 * Mosaic pixelation on raw RGBA data — pure, no canvas, so it can be unit
 * tested and audited.
 *
 * Every `block × block` cell is replaced by the **mean** of the pixels it
 * covers. That is a genuine, lossy destruction of the original pixels: the
 * only thing left of a cell is one average colour. Cells at the right and
 * bottom edges are partial and are averaged over the pixels they actually
 * cover, so no pixel is ever left untouched inside the region.
 *
 * A blur is deliberately not offered — a convolution keeps most of the
 * original information and can be partly inverted.
 */

/** Below this, mosaic cells are small enough to leak the glyph shapes. */
export const MIN_BLOCK = 8
export const DEFAULT_BLOCK = 16
export const MAX_BLOCK = 64

/** Clamp a requested block size into the range the tool guarantees. */
export function clampBlock(block: number): number {
  if (!Number.isFinite(block)) return DEFAULT_BLOCK
  return Math.min(MAX_BLOCK, Math.max(MIN_BLOCK, Math.floor(block)))
}

/**
 * Replace each cell of the `width × height` RGBA buffer with its mean colour,
 * in place. All four channels are averaged, alpha included, so a translucent
 * region stays translucent instead of picking up a hard edge.
 */
export function pixelateInPlace(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  block: number,
): void {
  if (width <= 0 || height <= 0) return
  const size = clampBlock(block)

  for (let cellY = 0; cellY < height; cellY += size) {
    const cellHeight = Math.min(size, height - cellY)
    for (let cellX = 0; cellX < width; cellX += size) {
      const cellWidth = Math.min(size, width - cellX)

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let y = cellY; y < cellY + cellHeight; y++) {
        let i = (y * width + cellX) * 4
        for (let x = 0; x < cellWidth; x++) {
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          a += data[i + 3]
          i += 4
        }
      }

      const count = cellWidth * cellHeight
      const meanR = Math.round(r / count)
      const meanG = Math.round(g / count)
      const meanB = Math.round(b / count)
      const meanA = Math.round(a / count)

      for (let y = cellY; y < cellY + cellHeight; y++) {
        let i = (y * width + cellX) * 4
        for (let x = 0; x < cellWidth; x++) {
          data[i] = meanR
          data[i + 1] = meanG
          data[i + 2] = meanB
          data[i + 3] = meanA
          i += 4
        }
      }
    }
  }
}

/**
 * Turn an anti-aliased alpha mask into a binary one: pixels at or above
 * `threshold` become fully opaque black, the rest fully transparent. Used so a
 * brush mask applied twice (erase, then clip) leaves no partial-alpha halo.
 */
export function hardenAlpha(data: Uint8ClampedArray, threshold = 128): void {
  for (let i = 3; i < data.length; i += 4) {
    const on = data[i]! >= threshold
    data[i - 3] = 0
    data[i - 2] = 0
    data[i - 1] = 0
    data[i] = on ? 255 : 0
  }
}
