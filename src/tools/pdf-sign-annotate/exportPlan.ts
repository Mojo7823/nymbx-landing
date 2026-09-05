import { viewedDrawAngle, viewedTopLeftToUser, type PageGeometry } from '../../lib/pdfGeometry'
import { strokesToPath } from './ink'
import {
  boundsOf,
  CHECK_PATH,
  CHECK_STROKE,
  CHECK_VIEWBOX,
  LINE_HEIGHT_RATIO,
  textBaselineY,
  type SignObject,
} from './objects'

/**
 * Turns editor objects into a flat list of pdf-lib draw calls.
 *
 * This is a **pure** function: no pdf-lib, no DOM. The worker only executes
 * what it gets, so the coordinate math can be unit-tested for every page
 * rotation without rendering a PDF.
 */

interface DrawBase {
  /** 0-based page index. */
  page: number
  /** pdf-lib draw origin in raw user space. */
  x: number
  y: number
  /** Counter-clockwise degrees to pass to pdf-lib. */
  rotate: number
}

export interface TextDraw extends DrawBase {
  type: 'text'
  text: string
  size: number
  lineHeight: number
  color: string
}

export interface ImageDraw extends DrawBase {
  type: 'image'
  imageId: string
  width: number
  height: number
}

export interface PathDraw extends DrawBase {
  type: 'path'
  /** SVG path data in y-down coordinates relative to (x, y). */
  path: string
  scale: number
  /** Fill color, or null for a stroke-only path. */
  fill: string | null
  stroke: string | null
  strokeWidth: number
}

export type DrawCall = TextDraw | ImageDraw | PathDraw

export function exportPlan(
  objects: readonly SignObject[],
  pages: readonly PageGeometry[],
): DrawCall[] {
  const calls: DrawCall[] = []

  for (const obj of objects) {
    const page = pages[obj.page]
    if (!page) continue
    const rotate = viewedDrawAngle(page.rotate)

    switch (obj.kind) {
      case 'text': {
        if (obj.text === '') break
        // Anchor: the start of the FIRST LINE'S BASELINE — the same point the
        // preview's <text y> uses, so preview and export agree.
        const { x, y } = viewedTopLeftToUser(obj.x, textBaselineY(obj), page)
        calls.push({
          type: 'text',
          page: obj.page,
          x,
          y,
          rotate,
          text: obj.text,
          size: obj.size,
          lineHeight: obj.size * LINE_HEIGHT_RATIO,
          color: obj.color,
        })
        break
      }
      case 'image': {
        // Anchor: the bottom-left of the image box.
        const box = boundsOf(obj)
        const { x, y } = viewedTopLeftToUser(box.x, box.y + box.height, page)
        calls.push({
          type: 'image',
          page: obj.page,
          x,
          y,
          rotate,
          imageId: obj.imageId,
          width: obj.width,
          height: obj.height,
        })
        break
      }
      case 'ink': {
        const path = strokesToPath(obj.strokes, obj.thickness)
        if (path === '') break
        // Anchor: the box top-left; SVG path coordinates are y-down from there.
        const { x, y } = viewedTopLeftToUser(obj.x, obj.y, page)
        calls.push({
          type: 'path',
          page: obj.page,
          x,
          y,
          rotate,
          path,
          scale: 1,
          fill: obj.color,
          stroke: null,
          strokeWidth: 0,
        })
        break
      }
      default: {
        const scale = obj.size / CHECK_VIEWBOX
        const { x, y } = viewedTopLeftToUser(obj.x, obj.y, page)
        calls.push({
          type: 'path',
          page: obj.page,
          x,
          y,
          rotate,
          path: CHECK_PATH,
          scale,
          fill: null,
          stroke: obj.color,
          strokeWidth: CHECK_STROKE * scale,
        })
        break
      }
    }
  }

  return calls
}
