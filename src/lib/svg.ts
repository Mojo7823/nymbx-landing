/** Extract pixel dimensions from an SVG string (viewBox or width/height). */
export function parseSvgSize(svg: string): { width: number; height: number } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  const viewBox = root
    .getAttribute('viewBox')
    ?.split(/[\s,]+/)
    .map(Number)
  if (viewBox?.length === 4 && viewBox[2]! > 0 && viewBox[3]! > 0) {
    return { width: viewBox[2]!, height: viewBox[3]! }
  }
  const width = parseFloat(root.getAttribute('width') ?? '')
  const height = parseFloat(root.getAttribute('height') ?? '')
  if (width > 0 && height > 0) return { width, height }
  return { width: 800, height: 600 }
}

/**
 * Rasterize an SVG string to a PNG blob. The SVG is given explicit
 * dimensions (browsers report naturalWidth 0 for viewBox-only SVGs) and
 * drawn onto a canvas at `scale`× over `background`.
 */
export async function svgToPngBlob(
  svg: string,
  options?: { scale?: number; background?: string },
): Promise<Blob> {
  const { scale = 2, background = '#ffffff' } = options ?? {}
  const { width, height } = parseSvgSize(svg)

  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  doc.documentElement.setAttribute('width', String(width))
  doc.documentElement.setAttribute('height', String(height))
  const sized = new XMLSerializer().serializeToString(doc.documentElement)

  const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG could not be rasterized'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))),
        'image/png',
      ),
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}
