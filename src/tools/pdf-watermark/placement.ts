/**
 * Placement math for stamping watermarks.
 *
 * Everything the user configures (position preset, rotation) is defined in
 * "viewed space" — the page as a viewer displays it, honoring /Rotate.
 * pdf-lib draws in raw user space, so the target point and angle must be
 * mapped back through the page's rotation.
 */

import { viewedSize, viewedToUser } from '../../lib/pdfGeometry'

export type PositionPreset =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export const POSITION_PRESETS: PositionPreset[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

// Rotation/viewed-space helpers live in src/lib/pdfGeometry.ts (shared with
// the sign & annotate tool); re-exported here so this module stays the single
// import site for the watermark tool.
export { normalizeRotate, viewedSize, viewedToUser } from '../../lib/pdfGeometry'

/** Horizontal/vertical anchor of a preset: 0 = left/bottom, 1 = right/top. */
export function presetAnchor(preset: PositionPreset): { ax: number; ay: number } {
  const [v, horiz] = preset === 'center' ? ['middle', 'center'] : preset.split('-')
  const ax = horiz === 'left' ? 0 : horiz === 'right' ? 1 : 0.5
  const ay = v === 'bottom' ? 0 : v === 'top' ? 1 : 0.5
  return { ax, ay }
}

export interface StampPlacement {
  /** Draw origin (bottom-left of the unrotated stamp box) in user space. */
  x: number
  y: number
  /** Angle to pass to pdf-lib (counter-clockwise degrees). */
  drawAngle: number
}

/**
 * Compute where to draw a stamp of `sw`×`sh` (viewed-space units, unrotated
 * box with origin at its bottom-left) so that the preset's anchor point sits
 * `margin` away from the viewed page edges, rotated by `angleDeg` CCW around
 * the anchor as seen by the viewer.
 */
export function placeStamp(
  pageW: number,
  pageH: number,
  rotate: number,
  preset: PositionPreset,
  sw: number,
  sh: number,
  angleDeg: number,
  margin: number,
): StampPlacement {
  const { vw, vh } = viewedSize(pageW, pageH, rotate)
  const { ax, ay } = presetAnchor(preset)

  // Anchor target in viewed space, inset by the margin (edges only).
  const tx = ax === 0 ? margin : ax === 1 ? vw - margin : vw / 2
  const ty = ay === 0 ? margin : ay === 1 ? vh - margin : vh / 2

  // The stamp-local anchor point, rotated into viewed space.
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const localX = ax * sw
  const localY = ay * sh
  const offX = localX * cos - localY * sin
  const offY = localX * sin + localY * cos

  const { x, y } = viewedToUser(tx - offX, ty - offY, pageW, pageH, rotate)
  return { x, y, drawAngle: angleDeg + rotate }
}
/**
 * True when `text` needs an embedded Unicode font — anything outside
 * WinAnsi (Latin-1 plus the common typographic punctuation block).
 */
export function needsUnicodeFont(text: string): boolean {
  return /[^\u0020-\u007e\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]/.test(
    text,
  )
}
