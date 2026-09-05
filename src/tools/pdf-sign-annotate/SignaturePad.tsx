import { useRef, useState } from 'react'
import { Check, Eraser, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { strokesToPath, type InkPoint, type InkStroke } from './ink'

export const PAD_WIDTH = 480
export const PAD_HEIGHT = 180

export interface SignaturePadProps {
  /** Strokes to start from ("reuse last signature"), in pad units. */
  initialStrokes?: InkStroke[]
  initialThickness?: number
  onCancel: () => void
  onPlace: (strokes: InkStroke[], thickness: number) => void
}

/** Modal signature pad. Strokes are returned in pad units (points). */
export function SignaturePad({
  initialStrokes,
  initialThickness = 4,
  onCancel,
  onPlace,
}: SignaturePadProps) {
  const [strokes, setStrokes] = useState<InkStroke[]>(initialStrokes ?? [])
  const [live, setLive] = useState<InkStroke | null>(null)
  const [thickness, setThickness] = useState(initialThickness)
  const svgRef = useRef<SVGSVGElement>(null)
  const drawingId = useRef<number | null>(null)

  function toPad(e: React.PointerEvent<SVGSVGElement>): InkPoint {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0, p: 0.5 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    const local = ctm ? pt.matrixTransform(ctm.inverse()) : pt
    return { x: local.x, y: local.y, p: e.pressure > 0 ? e.pressure : 0.5 }
  }

  function handleDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!e.isPrimary || drawingId.current !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingId.current = e.pointerId
    setLive([toPad(e)])
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerId !== drawingId.current) return
    const point = toPad(e)
    setLive((prev) => (prev ? [...prev, point] : prev))
  }

  function handleUp(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerId !== drawingId.current) return
    drawingId.current = null
    setLive((prev) => {
      if (prev && prev.length > 0) setStrokes((all) => [...all, prev])
      return null
    })
  }

  const all = live ? [...strokes, live] : strokes
  const empty = all.length === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Draw your signature"
    >
      <div className="w-full max-w-lg rounded-lg border border-line bg-card p-4 shadow-lg">
        <h2 className="font-display text-base font-semibold text-ink">Draw your signature</h2>
        <p className="mt-1 text-xs text-muted">
          Sign with a mouse, trackpad or finger. The signature stays in this tab — it is never
          uploaded and never saved to this device.
        </p>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${PAD_WIDTH} ${PAD_HEIGHT}`}
          className="mt-3 w-full touch-none rounded-md border border-line-strong bg-white"
          style={{ aspectRatio: `${PAD_WIDTH} / ${PAD_HEIGHT}` }}
          aria-label="Signature pad"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
        >
          <line
            x1={24}
            y1={PAD_HEIGHT - 36}
            x2={PAD_WIDTH - 24}
            y2={PAD_HEIGHT - 36}
            stroke="#d4d4d4"
            strokeWidth={1}
          />
          {!empty && <path d={strokesToPath(all, thickness)} fill="#111111" />}
        </svg>

        <label className="mt-3 flex flex-col gap-1">
          <span className="flex justify-between text-xs font-medium text-muted">
            Pen thickness
            <span className="font-mono tabular-nums">{thickness} pt</span>
          </span>
          <input
            type="range"
            min={1}
            max={12}
            value={thickness}
            onChange={(e) => setThickness(Number(e.target.value))}
            className="accent-(--color-pine)"
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setStrokes([])} disabled={empty}>
            <Eraser className="size-3.5" />
            Clear
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            <X className="size-3.5" />
            Cancel
          </Button>
          <Button size="sm" onClick={() => onPlace(strokes, thickness)} disabled={empty}>
            <Check className="size-3.5" />
            Place on page
          </Button>
        </div>
      </div>
    </div>
  )
}
