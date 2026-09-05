import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { normalizeRotate, viewedSize, type PageGeometry } from '../../lib/pdfGeometry'

/** Geometry of one page, in points. */
export interface PageInfo extends PageGeometry {
  /** Viewed (rotation-aware) width in points. */
  vw: number
  /** Viewed (rotation-aware) height in points. */
  vh: number
}

export interface LoadedPdf {
  name: string
  size: number
  /** A copy of the dropped bytes — the original File is never mutated. */
  bytes: Uint8Array
  doc: PDFDocumentProxy
  task: PDFDocumentLoadingTask
  pageCount: number
  pages: PageInfo[]
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  return pdfjs
}

/** Open a dropped PDF and read every page's geometry (cheap, no rendering). */
export async function openPdf(file: File): Promise<LoadedPdf> {
  const pdfjs = await loadPdfjs()
  const bytes = new Uint8Array(await file.arrayBuffer())
  // pdf.js takes ownership of the buffer it is handed — give it a copy.
  const task = pdfjs.getDocument({ data: bytes.slice() })
  const doc = await task.promise

  const pages: PageInfo[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const [x0, y0, x1, y1] = page.view
    const width = x1 - x0
    const height = y1 - y0
    const rotate = normalizeRotate(page.rotate)
    const { vw, vh } = viewedSize(width, height, rotate)
    pages.push({ width, height, rotate, vw, vh })
  }

  return { name: file.name, size: file.size, bytes, doc, task, pageCount: doc.numPages, pages }
}

/**
 * Renders pages on demand and keeps the last few results, so page switches
 * feel instant without ever rendering the whole document up front.
 */
export interface PageRenderer {
  render(
    doc: PDFDocumentProxy,
    index: number,
    target: HTMLCanvasElement,
    scale: number,
  ): Promise<void>
  dispose(): void
}

const CACHE_LIMIT = 3

export function createPageRenderer(): PageRenderer {
  const cache = new Map<string, HTMLCanvasElement>()
  let current: RenderTask | null = null

  return {
    async render(doc, index, target, scale) {
      const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
      const key = `${index}@${scale.toFixed(3)}@${dpr}`
      const hit = cache.get(key)
      if (hit) {
        cache.delete(key)
        cache.set(key, hit)
        target.width = hit.width
        target.height = hit.height
        target.getContext('2d')?.drawImage(hit, 0, 0)
        return
      }

      const page = await doc.getPage(index + 1)
      const viewport = page.getViewport({ scale: scale * dpr })
      const off = document.createElement('canvas')
      off.width = Math.max(1, Math.floor(viewport.width))
      off.height = Math.max(1, Math.floor(viewport.height))
      current?.cancel()
      const task = page.render({ canvas: off, viewport })
      current = task
      try {
        await task.promise
      } catch {
        return /* RenderingCancelledException when the user pages on quickly */
      } finally {
        if (current === task) current = null
      }

      cache.set(key, off)
      while (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value
        if (oldest === undefined) break
        cache.delete(oldest)
      }
      target.width = off.width
      target.height = off.height
      target.getContext('2d')?.drawImage(off, 0, 0)
    },
    dispose() {
      current?.cancel()
      current = null
      cache.clear()
    },
  }
}

/** Error wording shared with the other PDF tools. */
export function pdfErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  return name === 'PasswordException'
    ? 'This PDF is password-protected. Remove the password first; encrypted files are not supported.'
    : 'Could not read this file as a PDF. It may be corrupted or not a PDF at all.'
}
