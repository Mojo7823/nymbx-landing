/**
 * Shared geometry for mapping between "viewed space" and PDF user space.
 *
 * Viewed space is the page as a viewer displays it (honoring /Rotate).
 * Two flavors are used across the tools:
 *  - y-up viewed space (PDF convention), used by the watermark placement math
 *  - y-down viewed space with a top-left origin (screen convention), used by
 *    the sign & annotate editor, where objects are stored in points
 *
 * pdf-lib always draws in raw, unrotated user space (origin bottom-left,
 * y up), so both flavors have to be mapped back through the page rotation.
 */

export type Rotation = 0 | 90 | 180 | 270

/** Normalize any /Rotate value to 0 | 90 | 180 | 270. */
export function normalizeRotate(angle: number): Rotation {
  return ((((Math.round(angle / 90) * 90) % 360) + 360) % 360) as Rotation
}

/** Page dimensions as displayed by a viewer (swapped for 90/270). */
export function viewedSize(w: number, h: number, rotate: number): { vw: number; vh: number } {
  return rotate % 180 === 0 ? { vw: w, vh: h } : { vw: h, vh: w }
}

/** Map a viewed-space point (y up) back to raw user space. */
export function viewedToUser(
  vx: number,
  vy: number,
  w: number,
  h: number,
  rotate: number,
): { x: number; y: number } {
  switch (rotate) {
    case 90:
      return { x: w - vy, y: vx }
    case 180:
      return { x: w - vx, y: h - vy }
    case 270:
      return { x: vy, y: h - vx }
    default:
      return { x: vx, y: vy }
  }
}

/** A page's raw (unrotated) media box plus its /Rotate value. */
export interface PageGeometry {
  /** Unrotated media-box width in points. */
  width: number
  /** Unrotated media-box height in points. */
  height: number
  /** /Rotate value; normalized internally. */
  rotate: number
}

/**
 * Map a point given in top-left-origin, y-**down** viewed points (the way the
 * editor stores objects) to the pdf-lib draw origin in user space.
 */
export function viewedTopLeftToUser(
  vx: number,
  vyDown: number,
  page: PageGeometry,
): { x: number; y: number } {
  const rotate = normalizeRotate(page.rotate)
  const { vh } = viewedSize(page.width, page.height, rotate)
  return viewedToUser(vx, vh - vyDown, page.width, page.height, rotate)
}

/**
 * Counter-clockwise angle (degrees) that has to be passed to pdf-lib so an
 * object drawn in user space appears upright on a rotated page.
 */
export function viewedDrawAngle(rotate: number): number {
  return normalizeRotate(rotate)
}
