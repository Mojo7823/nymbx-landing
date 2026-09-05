import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { cx } from '../../lib/cx'
import { redraw } from './render'
import {
  MIN_DRAG,
  clampRegion,
  normalizeRect,
  regionBounds,
  replaceRegion,
  resizeRect,
  moveRegion,
  hitTest,
  type Box,
  type Point,
  type Region,
  type ResizeHandle,
} from './regions'

export type EditorTool = 'rect' | 'brush'

const HANDLES: ResizeHandle[] = ['nw', 'ne', 'sw', 'se']
const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
}

export interface EditorProps {
  bitmap: ImageBitmap
  regions: Region[]
  selectedId: string | null
  tool: EditorTool
  brushSize: number
  /** Colour previewed for the stroke/rectangle being drawn. */
  previewColor: string
  /** CSS pixels per image pixel, or 'fit' to scale to the container. */
  zoom: number | 'fit'
  /** The working canvas — the parent exports these very pixels. */
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  onSelect: (id: string | null) => void
  onCreateRect: (box: Box) => void
  onCreateBrush: (points: Point[]) => void
  /** A move/resize gesture finished — commit this region to the history. */
  onCommitRegion: (region: Region) => void
}

interface DragState {
  pointerId: number
  kind: 'draw-rect' | 'draw-brush' | 'move' | 'resize'
  handle: ResizeHandle
  origin: Point
  base: Region | null
  offset: Point
  moved: boolean
}

export function Editor({
  bitmap,
  regions,
  selectedId,
  tool,
  brushSize,
  previewColor,
  zoom,
  canvasRef,
  onSelect,
  onCreateRect,
  onCreateBrush,
  onCommitRegion,
}: EditorProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [pendingRect, setPendingRect] = useState<Box | null>(null)
  const [pendingStroke, setPendingStroke] = useState<Point[] | null>(null)
  /** Live move/resize preview; committed to the history on pointer up. */
  const [draft, setDraft] = useState<Region | null>(null)
  const [cursor, setCursor] = useState<Point | null>(null)

  useEffect(() => {
    const element = wrapperRef.current
    if (!element) return
    setContainerWidth(element.clientWidth)
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const shown = draft ? replaceRegion(regions, draft) : regions

  // The canvas holds the redacted pixels: this is both the preview and,
  // byte for byte, what the export encodes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    redraw(canvas, bitmap, shown)
  }, [canvasRef, bitmap, shown])

  const scale =
    zoom === 'fit' ? Math.min(1, containerWidth > 0 ? containerWidth / bitmap.width : 1) : zoom
  const displayWidth = Math.max(1, bitmap.width * scale)
  const displayHeight = Math.max(1, bitmap.height * scale)
  /** One CSS pixel expressed in image pixels — keeps outlines hairline. */
  const px = 1 / scale

  const toImagePoint = useCallback((e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const point = svg.createSVGPoint()
    point.x = e.clientX
    point.y = e.clientY
    const ctm = svg.getScreenCTM()
    const local = ctm ? point.matrixTransform(ctm.inverse()) : point
    return { x: local.x, y: local.y }
  }, [])

  function startDrag(e: ReactPointerEvent<Element>, state: Omit<DragState, 'pointerId' | 'moved'>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { ...state, pointerId: e.pointerId, moved: false }
  }

  function handlePointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (!e.isPrimary || dragRef.current) return
    const point = toImagePoint(e)

    if (tool === 'brush') {
      startDrag(e, {
        kind: 'draw-brush',
        handle: 'se',
        origin: point,
        base: null,
        offset: { x: 0, y: 0 },
      })
      setPendingStroke([point])
      return
    }

    const hit = hitTest(regions, point.x, point.y)
    if (hit) {
      onSelect(hit.id)
      const bounds = regionBounds(hit)
      startDrag(e, {
        kind: 'move',
        handle: 'se',
        origin: point,
        base: hit,
        offset: { x: point.x - bounds.x, y: point.y - bounds.y },
      })
      return
    }

    onSelect(null)
    startDrag(e, {
      kind: 'draw-rect',
      handle: 'se',
      origin: point,
      base: null,
      offset: { x: 0, y: 0 },
    })
    setPendingRect({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  function handlePointerMove(e: ReactPointerEvent<Element>) {
    const point = toImagePoint(e)
    if (tool === 'brush') setCursor(point)

    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    drag.moved = true

    switch (drag.kind) {
      case 'draw-rect':
        setPendingRect(normalizeRect(drag.origin.x, drag.origin.y, point.x, point.y))
        break
      case 'draw-brush':
        setPendingStroke((prev) => (prev ? [...prev, point] : [point]))
        break
      case 'move': {
        if (!drag.base) break
        const bounds = regionBounds(drag.base)
        const moved = moveRegion(
          drag.base,
          point.x - drag.offset.x - bounds.x,
          point.y - drag.offset.y - bounds.y,
        )
        setDraft(clampRegion(moved, bitmap.width, bitmap.height))
        break
      }
      case 'resize': {
        if (!drag.base || drag.base.kind !== 'rect') break
        const resized = resizeRect(drag.base, drag.handle, point.x, point.y)
        setDraft(clampRegion(resized, bitmap.width, bitmap.height))
        break
      }
    }
  }

  function handlePointerUp(e: ReactPointerEvent<Element>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null

    if (drag.kind === 'draw-rect') {
      const box = pendingRect
      setPendingRect(null)
      // A click (or a sliver of a drag) deselects instead of creating a
      // region nobody can see.
      if (box && box.width >= MIN_DRAG && box.height >= MIN_DRAG) onCreateRect(box)
      return
    }
    if (drag.kind === 'draw-brush') {
      const points = pendingStroke
      setPendingStroke(null)
      if (points && points.length > 0) onCreateBrush(points)
      return
    }
    const next = draft
    setDraft(null)
    if (next && drag.moved) onCommitRegion(next)
  }

  const selected = shown.find((r) => r.id === selectedId) ?? null
  const selectedBounds = selected ? regionBounds(selected) : null

  return (
    <div
      ref={wrapperRef}
      className="min-w-0 overflow-auto rounded-lg border border-line bg-soft p-2"
    >
      <div
        className="relative mx-auto"
        style={{ width: displayWidth, height: displayHeight }}
        data-testid="redaction-stage"
      >
        <canvas
          ref={canvasRef}
          width={bitmap.width}
          height={bitmap.height}
          className="block h-full w-full rounded-xs shadow-sm"
          style={{ width: displayWidth, height: displayHeight }}
          aria-label="Screenshot with redactions applied"
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${bitmap.width} ${bitmap.height}`}
          width={displayWidth}
          height={displayHeight}
          className={cx(
            'absolute inset-0 touch-none',
            tool === 'brush' ? 'cursor-none' : 'cursor-crosshair',
          )}
          data-testid="redaction-overlay"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => setCursor(null)}
        >
          {/* Regions themselves are already in the canvas pixels; the overlay
              only shows what is not yet committed and what is selected. */}
          {pendingRect && (
            <rect
              x={pendingRect.x}
              y={pendingRect.y}
              width={pendingRect.width}
              height={pendingRect.height}
              fill={previewColor}
              fillOpacity={0.55}
              stroke="#0f766e"
              strokeWidth={px}
            />
          )}
          {pendingStroke && pendingStroke.length > 0 && (
            <polyline
              points={pendingStroke.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={previewColor}
              strokeOpacity={0.55}
              strokeWidth={brushSize}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {selectedBounds && (
            <g>
              <rect
                x={selectedBounds.x}
                y={selectedBounds.y}
                width={selectedBounds.width}
                height={selectedBounds.height}
                fill="none"
                stroke="#0f766e"
                strokeWidth={2 * px}
                strokeDasharray={`${5 * px} ${4 * px}`}
                pointerEvents="none"
              />
              {selected?.kind === 'rect' &&
                HANDLES.map((handle) => {
                  const size = 10 * px
                  const hx =
                    handle === 'nw' || handle === 'sw'
                      ? selectedBounds.x
                      : selectedBounds.x + selectedBounds.width
                  const hy =
                    handle === 'nw' || handle === 'ne'
                      ? selectedBounds.y
                      : selectedBounds.y + selectedBounds.height
                  return (
                    <rect
                      key={handle}
                      x={hx - size / 2}
                      y={hy - size / 2}
                      width={size}
                      height={size}
                      fill="#ffffff"
                      stroke="#0f766e"
                      strokeWidth={px}
                      className={HANDLE_CURSOR[handle]}
                      data-handle={handle}
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        if (!e.isPrimary || dragRef.current) return
                        startDrag(e, {
                          kind: 'resize',
                          handle,
                          origin: toImagePoint(e),
                          base: selected,
                          offset: { x: 0, y: 0 },
                        })
                      }}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                    />
                  )
                })}
            </g>
          )}

          {tool === 'brush' && cursor && (
            <circle
              cx={cursor.x}
              cy={cursor.y}
              r={brushSize / 2}
              fill="none"
              stroke="#0f766e"
              strokeWidth={2 * px}
              strokeDasharray={`${4 * px} ${3 * px}`}
              pointerEvents="none"
            />
          )}
        </svg>
      </div>
    </div>
  )
}
