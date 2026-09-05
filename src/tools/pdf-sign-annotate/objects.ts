import { scaleStrokes, strokeBounds, translateStrokes, type InkStroke } from './ink'

/**
 * Object model for the sign & annotate editor.
 *
 * Every object is stored in **viewed points**: the page as the viewer shows
 * it (honoring /Rotate), origin top-left, y down, units = PDF points. That
 * makes the model independent of the editor's zoom level — the SVG overlay
 * scales, the numbers do not.
 */

export type SignObjectKind = 'text' | 'image' | 'ink' | 'check'

interface ObjectBase {
  id: string
  /** 0-based page index. */
  page: number
  /** Top-left of the object's box, in viewed points. */
  x: number
  y: number
}

export interface TextObject extends ObjectBase {
  kind: 'text'
  text: string
  /** Font size in points. */
  size: number
  /** Box width in points; layout only, the export uses x/baseline. */
  width: number
  color: string
}

export interface ImageObject extends ObjectBase {
  kind: 'image'
  /** Key into the editor's image store (bytes live outside the history). */
  imageId: string
  width: number
  height: number
  /** Intrinsic aspect ratio (height / width), used when resizing. */
  aspect: number
}

export interface InkObject extends ObjectBase {
  kind: 'ink'
  /** Pen polylines, relative to the object's top-left. */
  strokes: InkStroke[]
  thickness: number
  color: string
  width: number
  height: number
}

export interface CheckObject extends ObjectBase {
  kind: 'check'
  /** Box side in points. */
  size: number
  color: string
}

export type SignObject = TextObject | ImageObject | InkObject | CheckObject

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Baseline-to-baseline factor used by both the preview and the export. */
export const LINE_HEIGHT_RATIO = 1.25
/** Where the first baseline sits below the text box top, as a share of size. */
export const TEXT_ASCENT_RATIO = 0.8
/** The checkmark preset is authored in a 24-unit box. */
export const CHECK_VIEWBOX = 24
export const CHECK_PATH = 'M 3 12 L 9.5 18.5 L 21 5'
/** Stroke width of the checkmark inside the 24-unit box. */
export const CHECK_STROKE = 2.5
/** Smallest side an object may be resized to. */
export const MIN_OBJECT_SIZE = 8

let seq = 0
/** Ids only have to be unique within one editing session. */
export function nextObjectId(kind: SignObjectKind): string {
  seq += 1
  return `${kind}-${seq}`
}

export function textLines(text: string): string[] {
  return text.split('\n')
}

export function textHeight(obj: TextObject): number {
  return textLines(obj.text).length * obj.size * LINE_HEIGHT_RATIO
}

/** First-line baseline in viewed points — what both sides draw from. */
export function textBaselineY(obj: TextObject): number {
  return obj.y + obj.size * TEXT_ASCENT_RATIO
}

/** The object's bounding box in viewed points. */
export function boundsOf(obj: SignObject): Box {
  switch (obj.kind) {
    case 'text':
      return { x: obj.x, y: obj.y, width: obj.width, height: textHeight(obj) }
    case 'check':
      return { x: obj.x, y: obj.y, width: obj.size, height: obj.size }
    default:
      return { x: obj.x, y: obj.y, width: obj.width, height: obj.height }
  }
}

// ── Factories ────────────────────────────────────────────────────────────

export function createText(
  page: number,
  x: number,
  y: number,
  opts?: { text?: string; size?: number; color?: string; width?: number },
): TextObject {
  const size = opts?.size ?? 16
  return {
    kind: 'text',
    id: nextObjectId('text'),
    page,
    x,
    y,
    text: opts?.text ?? 'Text',
    size,
    width: opts?.width ?? size * 8,
    color: opts?.color ?? '#111111',
  }
}

export function createCheck(
  page: number,
  x: number,
  y: number,
  size = 24,
  color = '#111111',
): CheckObject {
  return { kind: 'check', id: nextObjectId('check'), page, x, y, size, color }
}

export function createImage(
  page: number,
  x: number,
  y: number,
  imageId: string,
  width: number,
  height: number,
): ImageObject {
  return {
    kind: 'image',
    id: nextObjectId('image'),
    imageId,
    page,
    x,
    y,
    width,
    height,
    aspect: height / width,
  }
}

/**
 * Build an ink object from strokes given in **page** coordinates; the strokes
 * are re-based to the object's top-left so the export can draw the path at the
 * box origin.
 */
export function createInk(
  page: number,
  strokes: readonly InkStroke[],
  thickness: number,
  color: string,
): InkObject {
  const { minX, minY, maxX, maxY } = strokeBounds(strokes, thickness)
  return {
    kind: 'ink',
    id: nextObjectId('ink'),
    page,
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
    strokes: translateStrokes(strokes, -minX, -minY),
    thickness,
    color,
  }
}

/** Append strokes (page coordinates) to an existing ink object. */
export function appendInk(obj: InkObject, strokes: readonly InkStroke[]): InkObject {
  const absolute = [...translateStrokes(obj.strokes, obj.x, obj.y), ...strokes]
  const rebuilt = createInk(obj.page, absolute, obj.thickness, obj.color)
  return { ...rebuilt, id: obj.id }
}

export const DATE_FORMATS = ['iso', 'long', 'slash'] as const
export type DateFormat = (typeof DATE_FORMATS)[number]

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Date-stamp text; formats are fixed so the output never depends on locale. */
export function formatDate(date: Date, format: DateFormat): string {
  const y = date.getFullYear()
  const m = date.getMonth()
  const d = date.getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  switch (format) {
    case 'long':
      return `${d} ${MONTHS[m]} ${y}`
    case 'slash':
      return `${pad(d)}/${pad(m + 1)}/${y}`
    default:
      return `${y}-${pad(m + 1)}-${pad(d)}`
  }
}

// ── Editing ──────────────────────────────────────────────────────────────

export function moveObject<T extends SignObject>(obj: T, dx: number, dy: number): T {
  return { ...obj, x: obj.x + dx, y: obj.y + dy }
}

/** Scale an object about its own top-left by `factor` (aspect always kept). */
export function scaleObject<T extends SignObject>(obj: T, factor: number): T {
  switch (obj.kind) {
    case 'text':
      return { ...obj, size: obj.size * factor, width: obj.width * factor }
    case 'check':
      return { ...obj, size: obj.size * factor }
    case 'image':
      return { ...obj, width: obj.width * factor, height: obj.height * factor }
    default:
      return {
        ...obj,
        width: obj.width * factor,
        height: obj.height * factor,
        thickness: obj.thickness * factor,
        strokes: scaleStrokes(obj.strokes, factor),
      }
  }
}

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

/**
 * Resize by dragging `handle` to (px, py) in viewed points. The opposite
 * corner stays put and the aspect ratio is preserved for every object type
 * (text scales its font size).
 */
export function resizeObject<T extends SignObject>(
  obj: T,
  handle: ResizeHandle,
  px: number,
  py: number,
): T {
  const box = boundsOf(obj)
  if (box.width <= 0 || box.height <= 0) return obj
  const left = handle === 'nw' || handle === 'sw'
  const top = handle === 'nw' || handle === 'ne'
  const anchorX = left ? box.x + box.width : box.x
  const anchorY = top ? box.y + box.height : box.y

  const rawFactor = Math.max(
    Math.abs(px - anchorX) / box.width,
    Math.abs(py - anchorY) / box.height,
  )
  const minFactor = MIN_OBJECT_SIZE / Math.min(box.width, box.height)
  const factor = Math.max(rawFactor, minFactor)

  const scaled = scaleObject(obj, factor)
  const next = boundsOf(scaled)
  return {
    ...scaled,
    x: left ? anchorX - next.width : anchorX,
    y: top ? anchorY - next.height : anchorY,
  }
}

/** Keep an object inside the viewed page box (at least partly reachable). */
export function clampToPage<T extends SignObject>(obj: T, vw: number, vh: number): T {
  const box = boundsOf(obj)
  const x = Math.min(Math.max(obj.x, 0), Math.max(vw - box.width, 0))
  const y = Math.min(Math.max(obj.y, 0), Math.max(vh - box.height, 0))
  return { ...obj, x, y }
}

/** Topmost object (last in z-order) whose box contains the point. */
export function hitTest(
  objects: readonly SignObject[],
  page: number,
  px: number,
  py: number,
): SignObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i]
    if (obj.page !== page) continue
    const b = boundsOf(obj)
    if (px >= b.x && px <= b.x + b.width && py >= b.y && py <= b.y + b.height) return obj
  }
  return null
}

export function replaceObject(objects: readonly SignObject[], next: SignObject): SignObject[] {
  return objects.map((o) => (o.id === next.id ? next : o))
}

export function removeObject(objects: readonly SignObject[], id: string): SignObject[] {
  return objects.filter((o) => o.id !== id)
}

// ── History ──────────────────────────────────────────────────────────────
//
// The undo/redo machinery is generic (`src/lib/history.ts`); this module
// keeps the page-object-shaped names the editor already imports.

export { HISTORY_LIMIT, commit, amend, canUndo, canRedo, undo, redo } from '../../lib/history'
import {
  emptyHistory as emptyGenericHistory,
  type History as GenericHistory,
} from '../../lib/history'

export type History = GenericHistory<SignObject[]>

export function emptyHistory(): History {
  return emptyGenericHistory<SignObject[]>([])
}
