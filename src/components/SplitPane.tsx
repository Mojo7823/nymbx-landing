import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface SplitPaneProps {
  first: ReactNode
  second: ReactNode
  /** Accessible label for the resize handle. */
  label?: string
  className?: string
}

/**
 * Two panes side by side with a draggable divider (drag, or focus it and use
 * arrow keys; Home or double-click resets to 50/50). Either pane can collapse
 * completely without unmounting. Below `lg`, both panes stack and remain usable.
 */
export function SplitPane({ first, second, label = 'Resize panels', className }: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; grabOffset: number } | null>(null)
  const [ratio, setRatio] = useState(0.5)
  const [dragging, setDragging] = useState(false)
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const onChange = () => {
      setDesktop(media.matches)
      dragRef.current = null
      setDragging(false)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const firstCollapsed = desktop && ratio === 0
  const secondCollapsed = desktop && ratio === 1
  const clamp = (r: number) => Math.min(1, Math.max(0, r))

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0 || dragRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = { pointerId: e.pointerId, grabOffset: e.clientX - rect.left }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.focus()
    e.preventDefault()
    setDragging(true)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const availableWidth = rect.width - e.currentTarget.getBoundingClientRect().width
    if (availableWidth <= 0) return
    setRatio(clamp((e.clientX - rect.left - drag.grabOffset) / availableWidth))
  }

  function stopDragging(e: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') setRatio((r) => clamp((Math.round(r * 100) - 5) / 100))
    else if (e.key === 'ArrowRight') setRatio((r) => clamp((Math.round(r * 100) + 5) / 100))
    else if (e.key === 'Home') setRatio(0.5)
    else return
    e.preventDefault()
  }

  return (
    <div
      ref={containerRef}
      className={cx(
        'grid min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 lg:grid-rows-1 lg:gap-0 lg:[grid-template-columns:minmax(0,var(--sp-l))_auto_minmax(0,var(--sp-r))]',
        dragging && 'select-none',
        className,
      )}
      style={{ '--sp-l': `${ratio}fr`, '--sp-r': `${1 - ratio}fr` } as CSSProperties}
    >
      <div
        className={cx('min-h-0 min-w-0 overflow-hidden', firstCollapsed && 'invisible')}
        inert={firstCollapsed}
        aria-hidden={firstCollapsed || undefined}
      >
        {first}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging}
        onDoubleClick={() => setRatio(0.5)}
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
      <div
        className={cx('min-h-0 min-w-0 overflow-hidden', secondCollapsed && 'invisible')}
        inert={secondCollapsed}
        aria-hidden={secondCollapsed || undefined}
      >
        {second}
      </div>
    </div>
  )
}
