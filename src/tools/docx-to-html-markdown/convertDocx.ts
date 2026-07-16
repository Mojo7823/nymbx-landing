import DOMPurify from 'dompurify'

export type ImageMode = 'embed' | 'separate'

export interface DocxImage {
  /** Path referenced from the converted document, e.g. `images/image-01.png`. */
  name: string
  data: Uint8Array<ArrayBuffer>
}

export interface DocxConversion {
  /** Sanitized HTML fragment (DOMPurify) — safe to render and to download. */
  html: string
  /** GFM markdown derived from the sanitized HTML. */
  markdown: string
  /** Extracted image files; always empty in `embed` mode. */
  images: DocxImage[]
  /** Conversion warnings reported by mammoth, deduplicated. */
  warnings: string[]
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'image/tiff': 'tiff',
  'image/webp': 'webp',
  'image/x-emf': 'emf',
  'image/x-wmf': 'wmf',
}

/**
 * mammoth emits Word tables as plain <td> rows with a <p> per cell, which
 * turndown-plugin-gfm keeps as raw HTML (it needs a <th> header row) and
 * whose block children would break pipe rows. Flatten cell paragraphs to
 * <br>-separated inline content and promote the first row to <th> — only
 * for the markdown pipeline; the HTML output stays faithful to mammoth's.
 */
function prepareTablesForMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const cell of doc.querySelectorAll('td, th')) {
    const children = Array.from(cell.children)
    if (children.length > 0 && children.every((c) => c.tagName === 'P')) {
      cell.innerHTML = children.map((c) => c.innerHTML).join('<br>')
    }
  }
  for (const table of doc.querySelectorAll('table')) {
    if (table.querySelector('th')) continue
    const firstRow = table.rows[0]
    if (!firstRow) continue
    for (const td of Array.from(firstRow.cells)) {
      const th = doc.createElement('th')
      th.innerHTML = td.innerHTML
      td.replaceWith(th)
    }
  }
  return doc.body.innerHTML
}

/**
 * Convert a `.docx` to sanitized HTML plus GFM markdown using mammoth and
 * turndown. `embed` inlines images as base64 data URIs; `separate` collects
 * them as files referenced by relative `images/…` paths (for a zip export).
 * Rejects when mammoth cannot open the file (corrupt, encrypted, not a docx).
 */
export async function convertDocx(
  buffer: ArrayBuffer,
  imageMode: ImageMode,
): Promise<DocxConversion> {
  const [{ default: mammoth }, { default: TurndownService }, { gfm }] = await Promise.all([
    import('mammoth'),
    import('turndown'),
    import('turndown-plugin-gfm'),
  ])

  const images: DocxImage[] = []
  const convertImage =
    imageMode === 'separate'
      ? mammoth.images.imgElement(async (image) => {
          const data = new Uint8Array(await image.readAsArrayBuffer())
          const ext = EXT_BY_TYPE[image.contentType] ?? 'bin'
          const name = `images/image-${String(images.length + 1).padStart(2, '0')}.${ext}`
          images.push({ name, data })
          return { src: name }
        })
      : undefined // mammoth's default inlines images as base64 data URIs

  // mammoth's browser build reads `arrayBuffer`; its node build (used when
  // Vitest runs these conversions) reads `buffer`. Both accept these bytes.
  const input = { arrayBuffer: buffer, buffer: new Uint8Array(buffer) } as {
    arrayBuffer: ArrayBuffer
  }
  const result = await mammoth.convertToHtml(input, { convertImage })

  const html = DOMPurify.sanitize(result.value)

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    hr: '---',
  })
  turndown.use(gfm)
  // GFM table cells are single-line; a literal <br> is the standard way to
  // keep an in-cell line break instead of turndown's "  \n" (breaks the row).
  turndown.addRule('cellLineBreak', {
    filter: (node) => node.nodeName === 'BR' && node.parentElement?.closest('td, th') != null,
    replacement: () => '<br>',
  })
  const markdown = turndown.turndown(prepareTablesForMarkdown(html))

  const warnings = [...new Set(result.messages.map((m) => m.message))]
  return { html, markdown, images, warnings }
}

/** Wrap a converted fragment in a minimal standalone HTML document. */
export function toHtmlDocument(fragment: string, title: string): string {
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
  body { max-width: 48rem; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; line-height: 1.6; }
  img { max-width: 100%; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 0.3em 0.6em; text-align: left; }
</style>
</head>
<body>
${fragment}
</body>
</html>
`
}
