import { clampBlock } from './pixelate'

/**
 * Redaction regions.
 *
 * Every coordinate is in **image pixels**, origin top-left. The canvas is
 * displayed CSS-scaled to the current zoom, so the model never depends on
 * the zoom level or on the device pixel ratio.
 */

export type RedactMode = 'black' | 'pixelate'
export type RegionKind = 'rect' | 'brush'

export interface Point {
  x: number
  y: number
}

interface RegionBase {
  id: string
  mode: RedactMode
  /** Fill colour used by the black-out mode. */
  color: string
  /** Mosaic cell size used by the pixelate mode. */
  block: number
}

export interface RectRegion extends RegionBase {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
}

export interface BrushRegion extends RegionBase {
  kind: 'brush'
  /** Stroke diameter in image pixels. */
  size: number
  points: Point[]
}

export type Region = RectRegion | BrushRegion

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Smallest rectangle a drag may create — anything less is treated as a click. */
export const MIN_DRAG = 3
/** Smallest side a rectangle may be resized to. */
export const MIN_REGION_SIZE = 4
export const MIN_BRUSH = 8
export const MAX_BRUSH = 200
export const DEFAULT_BRUSH = 32
export const DEFAULT_COLOR = '#000000'

let seq = 0
/** Ids only have to be unique within one editing session. */
export function nextRegionId(kind: RegionKind): string {
  seq += 1
  return `${kind}-${seq}`
}

export function clampBrushSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_BRUSH
  return Math.min(MAX_BRUSH, Math.max(MIN_BRUSH, Math.round(size)))
}

// ── Geometry ─────────────────────────────────────────────────────────────

/** Rectangle between two drag corners, with non-negative width/height. */
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): Box {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  }
}

/** Intersect a box with the image, so nothing outside the frame is edited. */
export function clampBox(box: Box, imageWidth: number, imageHeight: number): Box {
  const left = Math.max(0, Math.min(box.x, imageWidth))
  const top = Math.max(0, Math.min(box.y, imageHeight))
  const right = Math.max(0, Math.min(box.x + box.width, imageWidth))
  const bottom = Math.max(0, Math.min(box.y + box.height, imageHeight))
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/**
 * Whole-pixel box for `box`, clipped to the image. Edges are rounded to the
 * nearest pixel (not expanded) so the redacted area matches what the overlay
 * showed to within half a pixel at any zoom.
 */
export function pixelBox(box: Box, imageWidth: number, imageHeight: number): Box {
  const left = Math.max(0, Math.min(Math.round(box.x), imageWidth))
  const top = Math.max(0, Math.min(Math.round(box.y), imageHeight))
  const right = Math.min(imageWidth, Math.max(Math.round(box.x + box.width), 0))
  const bottom = Math.min(imageHeight, Math.max(Math.round(box.y + box.height), 0))
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/** The region's bounding box; a brush stroke is padded by half its width. */
export function regionBounds(region: Region): Box {
  if (region.kind === 'rect') {
    return { x: region.x, y: region.y, width: region.width, height: region.height }
  }
  if (region.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of region.points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const pad = region.size / 2
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + region.size,
    height: maxY - minY + region.size,
  }
}

// ── Factories ────────────────────────────────────────────────────────────

export interface RegionStyle {
  mode: RedactMode
  color: string
  block: number
}

export function createRect(box: Box, style: RegionStyle): RectRegion {
  return {
    kind: 'rect',
    id: nextRegionId('rect'),
    mode: style.mode,
    color: style.color,
    block: clampBlock(style.block),
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  }
}

export function createBrush(
  points: readonly Point[],
  size: number,
  style: RegionStyle,
): BrushRegion {
  return {
    kind: 'brush',
    id: nextRegionId('brush'),
    mode: style.mode,
    color: style.color,
    block: clampBlock(style.block),
    size: clampBrushSize(size),
    points: points.map((p) => ({ x: p.x, y: p.y })),
  }
}

// ── Editing ──────────────────────────────────────────────────────────────

export function moveRegion<T extends Region>(region: T, dx: number, dy: number): T {
  if (region.kind === 'rect') return { ...region, x: region.x + dx, y: region.y + dy }
  return { ...region, points: region.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
}

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

/**
 * Resize a rectangle by dragging `handle` to (px, py); the opposite corner
 * stays put. Free ratio — a redaction box has no aspect to preserve.
 */
export function resizeRect(rect: RectRegion, handle: ResizeHandle, px: number, py: number): Region {
  const left = handle === 'nw' || handle === 'sw'
  const top = handle === 'nw' || handle === 'ne'
  const anchorX = left ? rect.x + rect.width : rect.x
  const anchorY = top ? rect.y + rect.height : rect.y
  const box = normalizeRect(anchorX, anchorY, px, py)
  return {
    ...rect,
    x: box.x,
    y: box.y,
    width: Math.max(MIN_REGION_SIZE, box.width),
    height: Math.max(MIN_REGION_SIZE, box.height),
  }
}

/** Shift `lo`..`lo + span` back inside 0..limit; returns the needed offset. */
function shiftInto(lo: number, span: number, limit: number): number {
  if (span >= limit) return -lo // wider than the image: pin to the left edge
  if (lo < 0) return -lo
  if (lo + span > limit) return limit - (lo + span)
  return 0
}

/** Keep a region inside the image (rectangles are also size-clamped). */
export function clampRegion<T extends Region>(
  region: T,
  imageWidth: number,
  imageHeight: number,
): T {
  if (region.kind === 'rect') {
    const width = Math.min(region.width, imageWidth)
    const height = Math.min(region.height, imageHeight)
    return {
      ...region,
      width,
      height,
      x: Math.min(Math.max(region.x, 0), Math.max(imageWidth - width, 0)),
      y: Math.min(Math.max(region.y, 0), Math.max(imageHeight - height, 0)),
    }
  }
  // A stroke keeps its shape; it is only shifted so its box stays reachable.
  const box = regionBounds(region)
  return moveRegion(
    region,
    shiftInto(box.x, box.width, imageWidth),
    shiftInto(box.y, box.height, imageHeight),
  )
}

/** Topmost region (last drawn) whose bounding box contains the point. */
export function hitTest(regions: readonly Region[], x: number, y: number): Region | null {
  for (let i = regions.length - 1; i >= 0; i--) {
    const region = regions[i]
    const b = regionBounds(region)
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return region
  }
  return null
}

export function replaceRegion(regions: readonly Region[], next: Region): Region[] {
  return regions.map((r) => (r.id === next.id ? next : r))
}

export function removeRegion(regions: readonly Region[], id: string): Region[] {
  return regions.filter((r) => r.id !== id)
}

// ── Presentation ─────────────────────────────────────────────────────────

export function regionLabel(region: Region): string {
  return region.kind === 'rect' ? 'Rectangle' : 'Brush'
}

export function modeLabel(mode: RedactMode): string {
  return mode === 'black' ? 'Black-out' : 'Pixelate'
}

/** Human size of a region's bounding box, e.g. `420 × 38 px`. */
export function formatRegionSize(region: Region): string {
  const b = regionBounds(region)
  return `${Math.round(b.width)} × ${Math.round(b.height)} px`
}

export function regionCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'region' : 'regions'}`
}
