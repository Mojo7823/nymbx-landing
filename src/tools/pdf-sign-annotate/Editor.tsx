import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { cx } from '../../lib/cx'
import { strokesToPath, type InkPoint, type InkStroke } from './ink'
import { createPageRenderer, type PageInfo } from './pdfDoc'
import {
  boundsOf,
  clampToPage,
  hitTest,
  LINE_HEIGHT_RATIO,
  moveObject,
  resizeObject,
  textBaselineY,
  textLines,
  CHECK_PATH,
  CHECK_STROKE,
  CHECK_VIEWBOX,
  type ResizeHandle,
  type SignObject,
  type TextObject,
} from './objects'

export type EditorTool = 'select' | 'text' | 'image' | 'draw' | 'check' | 'date'

export const PREVIEW_FONT = '"NYMBX Sign", system-ui, sans-serif'

const HANDLES: ResizeHandle[] = ['nw', 'ne', 'sw', 'se']

export interface EditorProps {
  doc: PDFDocumentProxy
  pageIndex: number
  page: PageInfo
  /** CSS pixels per point. */
  scale: number
  /** Objects on the current page, in z-order. */
  objects: SignObject[]
  /** Object URLs for image stamps, keyed by imageId. */
  imageUrls: Record<string, string>
  selectedId: string | null
  tool: EditorTool
  inkColor: string
  inkThickness: number
  onSelect: (id: string | null) => void
  /** Live update while dragging (no history entry). */
  onDrag: (next: SignObject) => void
  /** Gesture finished — the parent commits to the history. */
  onDragEnd: () => void
  /** A placing tool was clicked at this point (viewed points). */
  onPlaceAt: (x: number, y: number) => void
  /** One pen-up with the Draw tool; points are in viewed points. */
  onInkStroke: (stroke: InkStroke) => void
  onTextEdit: (obj: TextObject, text: string) => void
}

interface DragState {
  pointerId: number
  mode: 'move' | 'resize'
  handle: ResizeHandle
  base: SignObject
  offsetX: number
  offsetY: number
  moved: boolean
}

export function Editor({
  doc,
  pageIndex,
  page,
  scale,
  objects,
  imageUrls,
  selectedId,
  tool,
  inkColor,
  inkThickness,
  onSelect,
  onDrag,
  onDragEnd,
  onPlaceAt,
  onInkStroke,
  onTextEdit,
}: EditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const rendererRef = useRef<ReturnType<typeof createPageRenderer> | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [live, setLive] = useState<InkStroke | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)

  rendererRef.current ??= createPageRenderer()
  useEffect(() => {
    const renderer = rendererRef.current
    return () => renderer?.dispose()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    if (!canvas || !renderer) return
    void renderer.render(doc, pageIndex, canvas, scale)
  }, [doc, pageIndex, scale])

  // Switching pages ends any inline text edit (React's "adjust state during
  // render" pattern — an effect here would cause a cascading render).
  const [editingPage, setEditingPage] = useState(pageIndex)
  if (editingPage !== pageIndex) {
    setEditingPage(pageIndex)
    setEditing(null)
  }

  function toPoint(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    const local = ctm ? pt.matrixTransform(ctm.inverse()) : pt
    return { x: local.x, y: local.y }
  }

  function inkPoint(e: React.PointerEvent): InkPoint {
    const { x, y } = toPoint(e)
    return { x, y, p: e.pressure > 0 ? e.pressure : 0.5 }
  }

  function startDrag(
    e: React.PointerEvent,
    obj: SignObject,
    mode: 'move' | 'resize',
    handle: ResizeHandle = 'se',
  ) {
    const { x, y } = toPoint(e)
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      mode,
      handle,
      base: obj,
      offsetX: x - obj.x,
      offsetY: y - obj.y,
      moved: false,
    }
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!e.isPrimary || dragRef.current) return
    const { x, y } = toPoint(e)

    if (tool === 'draw') {
      e.currentTarget.setPointerCapture(e.pointerId)
      setLive([inkPoint(e)])
      return
    }

    if (tool !== 'select') {
      onPlaceAt(x, y)
      return
    }

    const hit = hitTest(objects, pageIndex, x, y)
    onSelect(hit ? hit.id : null)
    if (hit) startDrag(e, hit, 'move')
  }

  function handlePointerMove(e: React.PointerEvent<Element>) {
    if (live) {
      setLive((prev) => (prev ? [...prev, inkPoint(e)] : prev))
      return
    }
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const { x, y } = toPoint(e)
    const next =
      drag.mode === 'move'
        ? moveObject(drag.base, x - drag.offsetX - drag.base.x, y - drag.offsetY - drag.base.y)
        : resizeObject(drag.base, drag.handle, x, y)
    drag.moved = true
    onDrag(clampToPage(next, page.vw, page.vh))
  }

  function handlePointerUp(e: React.PointerEvent<Element>) {
    if (live) {
      const stroke = live
      setLive(null)
      if (stroke.length > 0) onInkStroke(stroke)
      return
    }
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    if (drag.moved) onDragEnd()
  }

  const selectedObject = objects.find((o) => o.id === selectedId) ?? null
  const editingCandidate = editing ? objects.find((o) => o.id === editing.id) : undefined
  const editingObject = editingCandidate?.kind === 'text' ? editingCandidate : null

  const px = 1 / scale // one CSS pixel expressed in points
  const handleSize = 9 * px

  return (
    <div className="relative mx-auto" style={{ width: page.vw * scale, height: page.vh * scale }}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full rounded-sm bg-white shadow-sm"
        aria-label={`Page ${pageIndex + 1}`}
      />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${page.vw} ${page.vh}`}
        className={cx(
          'absolute inset-0 h-full w-full touch-none',
          tool === 'select'
            ? 'cursor-default'
            : tool === 'draw'
              ? 'cursor-crosshair'
              : 'cursor-copy',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {objects.map((obj) => (
          <ObjectView
            key={obj.id}
            obj={obj}
            imageUrls={imageUrls}
            hidden={editing?.id === obj.id}
            onDoubleClick={() => obj.kind === 'text' && setEditing({ id: obj.id, text: obj.text })}
          />
        ))}

        {live && <path d={strokesToPath([live], inkThickness)} fill={inkColor} />}

        {selectedObject && (
          <SelectionOverlay
            obj={selectedObject}
            px={px}
            handleSize={handleSize}
            onHandleDown={(e, handle) => startDrag(e, selectedObject, 'resize', handle)}
            onHandleMove={handlePointerMove}
            onHandleUp={handlePointerUp}
          />
        )}
      </svg>

      {editingObject && editing && (
        <TextEditor
          obj={editingObject}
          scale={scale}
          value={editing.text}
          onChange={(text) => setEditing({ id: editingObject.id, text })}
          onCommit={() => {
            onTextEdit(editingObject, editing.text)
            setEditing(null)
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function ObjectView({
  obj,
  imageUrls,
  hidden,
  onDoubleClick,
}: {
  obj: SignObject
  imageUrls: Record<string, string>
  hidden: boolean
  onDoubleClick: () => void
}) {
  if (hidden) return null

  switch (obj.kind) {
    case 'text':
      return (
        <text
          x={obj.x}
          y={textBaselineY(obj)}
          fontFamily={PREVIEW_FONT}
          fontSize={obj.size}
          fill={obj.color}
          xmlSpace="preserve"
          onDoubleClick={onDoubleClick}
        >
          {textLines(obj.text).map((line, i) => (
            <tspan key={i} x={obj.x} dy={i === 0 ? 0 : obj.size * LINE_HEIGHT_RATIO}>
              {line === '' ? ' ' : line}
            </tspan>
          ))}
        </text>
      )
    case 'image': {
      const href = imageUrls[obj.imageId]
      return href ? (
        <image href={href} x={obj.x} y={obj.y} width={obj.width} height={obj.height} />
      ) : null
    }
    case 'ink':
      return (
        <g transform={`translate(${obj.x} ${obj.y})`}>
          <path d={strokesToPath(obj.strokes, obj.thickness)} fill={obj.color} />
        </g>
      )
    default: {
      const scale = obj.size / CHECK_VIEWBOX
      return (
        <g transform={`translate(${obj.x} ${obj.y}) scale(${scale})`}>
          <path
            d={CHECK_PATH}
            fill="none"
            stroke={obj.color}
            strokeWidth={CHECK_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )
    }
  }
}

function SelectionOverlay({
  obj,
  px,
  handleSize,
  onHandleDown,
  onHandleMove,
  onHandleUp,
}: {
  obj: SignObject
  px: number
  handleSize: number
  onHandleDown: (e: React.PointerEvent<Element>, handle: ResizeHandle) => void
  onHandleMove: (e: React.PointerEvent<Element>) => void
  onHandleUp: (e: React.PointerEvent<Element>) => void
}) {
  const b = boundsOf(obj)
  return (
    <g>
      <rect
        x={b.x}
        y={b.y}
        width={b.width}
        height={b.height}
        fill="none"
        stroke="#0f766e"
        strokeWidth={px}
        strokeDasharray={`${4 * px} ${3 * px}`}
        pointerEvents="none"
      />
      {HANDLES.map((handle) => {
        const hx = handle === 'nw' || handle === 'sw' ? b.x : b.x + b.width
        const hy = handle === 'nw' || handle === 'ne' ? b.y : b.y + b.height
        return (
          <rect
            key={handle}
            x={hx - handleSize / 2}
            y={hy - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#ffffff"
            stroke="#0f766e"
            strokeWidth={px}
            className="cursor-nwse-resize"
            data-handle={handle}
            onPointerDown={(e) => {
              e.stopPropagation()
              if (e.isPrimary) onHandleDown(e, handle)
            }}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          />
        )
      })}
    </g>
  )
}

function TextEditor({
  obj,
  scale,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  obj: TextObject
  scale: number
  value: string
  onChange: (text: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const b = boundsOf(obj)
  return (
    <textarea
      autoFocus
      value={value}
      aria-label="Edit text"
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className="absolute resize-none rounded-xs border border-pine bg-white/95 p-0 text-ink outline-none"
      style={{
        left: b.x * scale,
        top: b.y * scale,
        width: Math.max(b.width, 40) * scale,
        height: Math.max(b.height, obj.size * LINE_HEIGHT_RATIO) * scale,
        fontFamily: PREVIEW_FONT,
        fontSize: obj.size * scale,
        lineHeight: `${obj.size * LINE_HEIGHT_RATIO * scale}px`,
        color: obj.color,
      }}
    />
  )
}
