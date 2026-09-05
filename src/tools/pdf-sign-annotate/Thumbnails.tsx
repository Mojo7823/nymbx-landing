import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { cx } from '../../lib/cx'
import type { PageInfo } from './pdfDoc'

const THUMB_WIDTH = 96

/** One page thumbnail; renders only once it scrolls into view. */
function Thumb({
  doc,
  index,
  page,
  active,
  marked,
  onSelect,
}: {
  doc: PDFDocumentProxy
  index: number
  page: PageInfo
  active: boolean
  marked: boolean
  onSelect: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setVisible(true),
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: RenderTask | null = null
    void (async () => {
      const pdfPage = await doc.getPage(index + 1)
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
      const viewport = pdfPage.getViewport({ scale: (THUMB_WIDTH / page.vw) * dpr })
      canvas.width = Math.max(1, Math.floor(viewport.width))
      canvas.height = Math.max(1, Math.floor(viewport.height))
      try {
        task = pdfPage.render({ canvas, viewport })
        await task.promise
      } catch {
        /* cancelled */
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, doc, index, page.vw])

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active}
      aria-label={`Go to page ${index + 1}`}
      className={cx(
        'flex w-full cursor-pointer flex-col items-center gap-1 rounded-md border p-1.5 transition-colors',
        active ? 'border-pine bg-pine/10' : 'border-line bg-card hover:border-line-strong',
      )}
    >
      <canvas
        ref={canvasRef}
        style={{ aspectRatio: `${page.vw} / ${page.vh}` }}
        className="w-full rounded-xs bg-white shadow-sm"
      />
      <span
        className={cx(
          'font-mono text-[10px] tabular-nums',
          active ? 'font-semibold text-pine' : 'text-muted',
        )}
      >
        {index + 1}
        {marked && <span className="ml-1 text-amber-badge">•</span>}
      </span>
    </button>
  )
}

export interface ThumbnailsProps {
  doc: PDFDocumentProxy
  pages: PageInfo[]
  pageIndex: number
  /** Page indices that carry at least one object. */
  markedPages: ReadonlySet<number>
  onSelect: (index: number) => void
}

/** Lazy thumbnail strip; hidden below 1024 px by the caller. */
export function Thumbnails({ doc, pages, pageIndex, markedPages, onSelect }: ThumbnailsProps) {
  return (
    <nav
      aria-label="Pages"
      className="hidden max-h-[70vh] w-32 shrink-0 flex-col gap-2 overflow-y-auto pr-1 lg:flex"
    >
      {pages.map((page, i) => (
        <Thumb
          key={i}
          doc={doc}
          index={i}
          page={page}
          active={i === pageIndex}
          marked={markedPages.has(i)}
          onSelect={() => onSelect(i)}
        />
      ))}
    </nav>
  )
}
