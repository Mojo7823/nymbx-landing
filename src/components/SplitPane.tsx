import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface SplitPaneProps {
  first: ReactNode
  second: ReactNode
  /** Accessible label for the resize handle. */
  label?: string
  /** Minimum fraction of the width either pane can shrink to. */
  min?: number
  className?: string
}

/**
 * Two panes side by side with a draggable divider (drag, or focus it and use
 * arrow keys; Home resets to 50/50). Below the `lg` breakpoint the panes
 * stack vertically and the divider is hidden.
 */
export function SplitPane({
  first,
  second,
  label = 'Resize panels',
  min = 0.2,
  className,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(0.5)
  const [dragging, setDragging] = useState(false)

  const clamp = (r: number) => Math.min(1 - min, Math.max(min, r))

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    setRatio(clamp((e.clientX - rect.left) / rect.width))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') setRatio((r) => clamp(r - 0.05))
    else if (e.key === 'ArrowRight') setRatio((r) => clamp(r + 0.05))
    else if (e.key === 'Home') setRatio(0.5)
    else return
    e.preventDefault()
  }

  return (
    <div
      ref={containerRef}
      className={cx(
        'grid grid-cols-1 gap-6 lg:gap-0 lg:[grid-template-columns:minmax(0,var(--sp-l))_auto_minmax(0,var(--sp-r))]',
        dragging && 'select-none',
        className,
      )}
      style={{ '--sp-l': `${ratio}fr`, '--sp-r': `${1 - ratio}fr` } as CSSProperties}
    >
      <div className="min-w-0">{first}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={Math.round((1 - min) * 100)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
        }}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId)
          setDragging(false)
        }}
        onKeyDown={onKeyDown}
        className="group relative hidden w-6 cursor-col-resize touch-none items-center justify-center focus:outline-none lg:flex"
      >
        <div
          className={cx(
            'h-full w-px bg-line transition-colors group-hover:bg-pine group-focus-visible:bg-pine',
            dragging && 'bg-pine',
          )}
        />
        <div
          className={cx(
            'absolute h-8 w-1 rounded-full bg-line-strong transition-colors group-hover:bg-pine group-focus-visible:bg-pine',
            dragging && 'bg-pine',
          )}
        />
      </div>
      <div className="min-w-0">{second}</div>
    </div>
  )
}
