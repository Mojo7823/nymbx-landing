/**
 * PDF → rendered page canvases, one at a time.
 *
 * A scanned page at 300 DPI is a ~8 MP canvas (~35 MB of backing store), so
 * pages are yielded lazily and each one's backing store is released before the
 * next is rendered. Never render the whole document up front.
 *
 * pdf.js is imported dynamically so it only reaches this route's chunk.
 */

/** The PDF needs a password; pdf.js cannot open it and neither can we. */
export class PdfPasswordError extends Error {
  constructor() {
    super(
      'This PDF is password-protected. Remove the password first; encrypted files are not supported.',
    )
    this.name = 'PdfPasswordError'
  }
}

export class PdfReadError extends Error {
  constructor() {
    super('Could not read this file as a PDF. It may be corrupted or not a PDF at all.')
    this.name = 'PdfReadError'
  }
}

export interface RenderedPage {
  pageNumber: number
  pageCount: number
  canvas: HTMLCanvasElement
  /** Drop the canvas backing store. Call before moving to the next page. */
  release: () => void
}

/**
 * Yield every page of `file` rendered at `dpi`. The consumer must finish with
 * a page (call `release`) before requesting the next one.
 */
export async function* renderPdfPages(file: File, dpi = 300): AsyncGenerator<RenderedPage> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })
  let doc
  try {
    doc = await task.promise
  } catch (cause) {
    void task.destroy()
    throw cause instanceof Error && cause.name === 'PasswordException'
      ? new PdfPasswordError()
      : new PdfReadError()
  }

  try {
    const pageCount = doc.numPages
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: dpi / 72 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      let released = false
      const release = () => {
        if (released) return
        released = true
        canvas.width = 0
        canvas.height = 0
        page.cleanup()
      }
      try {
        yield { pageNumber, pageCount, canvas, release }
      } finally {
        release()
      }
    }
  } finally {
    // Runs on early return/throw from the consumer too, so a cancelled job
    // never leaves the pdf.js worker holding the document.
    await task.destroy()
  }
}
