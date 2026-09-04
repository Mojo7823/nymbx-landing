/** Pure geometry for the crop / rotate / flip tool (no DOM). */

export interface AspectPreset {
  id: string
  label: string
  /** Null = free-form crop. */
  ratio: number | null
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: '1 : 1', ratio: 1 },
  { id: '4:3', label: '4 : 3', ratio: 4 / 3 },
  { id: '3:2', label: '3 : 2', ratio: 3 / 2 },
  { id: '16:9', label: '16 : 9', ratio: 16 / 9 },
  { id: '9:16', label: '9 : 16', ratio: 9 / 16 },
  { id: 'passport', label: 'Passport 35×45', ratio: 35 / 45 },
]

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function clampCrop(rect: Rect, boundsWidth: number, boundsHeight: number): Rect {
  const width = Math.min(Math.max(1, Math.round(rect.width)), boundsWidth)
  const height = Math.min(Math.max(1, Math.round(rect.height)), boundsHeight)
  const x = Math.min(Math.max(0, Math.round(rect.x)), Math.max(0, boundsWidth - width))
  const y = Math.min(Math.max(0, Math.round(rect.y)), Math.max(0, boundsHeight - height))
  return { x, y, width, height }
}

/** Bounding box of a w×h image rotated by `degrees` (any angle). */
export function rotatedSize(
  width: number,
  height: number,
  degrees: number,
): { width: number; height: number } {
  const radians = (Math.abs(degrees) % 360) * (Math.PI / 180)
  // cos(90°) is 6e-17, not 0 — snap so right angles stay pixel-exact.
  const snap = (v: number): number => (Math.abs(v) < 1e-9 ? 0 : v)
  const cos = Math.abs(snap(Math.cos(radians)))
  const sin = Math.abs(snap(Math.sin(radians)))
  return {
    width: Math.max(1, Math.ceil(width * cos + height * sin)),
    height: Math.max(1, Math.ceil(width * sin + height * cos)),
  }
}

/** Centered rect of the target aspect inside bounds (for preset switches). */
export function centeredRect(
  boundsWidth: number,
  boundsHeight: number,
  ratio: number | null,
): Rect {
  if (ratio === null) {
    return { x: 0, y: 0, width: boundsWidth, height: boundsHeight }
  }
  const boundsRatio = boundsWidth / boundsHeight
  const width = boundsRatio > ratio ? Math.round(boundsHeight * ratio) : boundsWidth
  const height = boundsRatio > ratio ? boundsHeight : Math.round(boundsWidth / ratio)
  return {
    x: Math.round((boundsWidth - width) / 2),
    y: Math.round((boundsHeight - height) / 2),
    width,
    height,
  }
}

/** Scale a crop rect from one frame size to another (display px → full px). */
export function scaleRect(
  rect: Rect,
  fromWidth: number,
  fromHeight: number,
  toWidth: number,
  toHeight: number,
): Rect {
  if (fromWidth <= 0 || fromHeight <= 0) return { x: 0, y: 0, width: toWidth, height: toHeight }
  return clampCrop(
    {
      x: (rect.x * toWidth) / fromWidth,
      y: (rect.y * toHeight) / fromHeight,
      width: (rect.width * toWidth) / fromWidth,
      height: (rect.height * toHeight) / fromHeight,
    },
    toWidth,
    toHeight,
  )
}

/** `photo.png` → `photo-cropped.png` (or .jpg for JPEG output). */
export function outputName(inputName: string, jpeg: boolean): string {
  const stem = inputName.replace(/\.[^.]+$/, '') || 'image'
  return `${stem}-cropped.${jpeg ? 'jpg' : 'png'}`
}
