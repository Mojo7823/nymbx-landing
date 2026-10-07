import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'

interface PdfPreviewProps {
  source: File | Uint8Array
  caption: string
}

export function PdfPreview({ source, caption }: PdfPreviewProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    let destroy: (() => void) | undefined
    async function open() {
      setLoading(true)
      setError(null)
      setDoc(null)
      try {
        GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        const data = source instanceof File ? await source.arrayBuffer() : source.slice()
        if (!active) return
        const task = getDocument({
          data,
          // Never resolve resources named by a user document over the network.
          useSystemFonts: true,
        })
        destroy = () => void task.destroy()
        const next = await task.promise
        if (active) {
          setDoc(next)
          setPageNumber((current) => Math.min(current, next.numPages))
        }
      } catch {
        if (active) setError('Preview unavailable. You can still fill and download the form.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void open()
    return () => {
      active = false
      destroy?.()
    }
  }, [source])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!doc || !canvas || width <= 0) return
    let active = true
    let task: RenderTask | undefined
    async function render() {
      setRendering(true)
      setError(null)
      try {
        const page = await doc!.getPage(pageNumber)
        if (!active) return
        const natural = page.getViewport({ scale: 1 })
        const scale = Math.min((width - 24) / natural.width, 2)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({ scale: Math.max(scale, 0.1) * dpr })
        // Render offscreen so a cancelled page can never leave a partial preview.
        const offscreen = document.createElement('canvas')
        offscreen.width = Math.ceil(viewport.width)
        offscreen.height = Math.ceil(viewport.height)
        task = page.render({ canvas: offscreen, viewport })
        await task.promise
        if (!active) return
        canvas!.width = offscreen.width
        canvas!.height = offscreen.height
        canvas!.style.width = `${viewport.width / dpr}px`
        canvas!.style.height = `${viewport.height / dpr}px`
        canvas!.getContext('2d')?.drawImage(offscreen, 0, 0)
      } catch {
        if (active)
          setError('This page could not be rendered. Try another page or download the PDF.')
      } finally {
        if (active) setRendering(false)
      }
    }
    void render()
    return () => {
      active = false
      task?.cancel()
    }
  }, [doc, pageNumber, width])

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">PDF preview</h2>
          <p className="mt-1 text-xs text-muted" aria-live="polite">
            {caption}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Previous page"
            disabled={!doc || pageNumber === 1}
            onClick={() => setPageNumber((n) => n - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted">
            Page {pageNumber} of {doc?.numPages ?? '…'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next page"
            disabled={!doc || pageNumber === doc.numPages}
            onClick={() => setPageNumber((n) => n + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto bg-soft">
        {(loading || rendering) && (
          <div className="p-3">
            <ProgressBar label={loading ? 'Opening preview…' : 'Rendering page…'} />
          </div>
        )}
        {error && (
          <p role="status" className="p-3 text-sm text-amber-badge">
            {error}
          </p>
        )}
        <canvas
          ref={canvasRef}
          aria-label={`PDF page ${pageNumber}`}
          className="mx-auto my-3 block max-w-full shadow-sm"
          hidden={loading || rendering || Boolean(error)}
        />
      </div>
    </section>
  )
}
