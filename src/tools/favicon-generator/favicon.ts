/**
 * Pure helpers for the favicon generator: ICO container writer, webmanifest
 * builder, and HTML snippet builder. No DOM.
 */

export interface PngAsset {
  /** Edge length in px (square). */
  size: number
  png: Uint8Array
}

/** Sizes bundled into favicon.ico (PNG-compressed entries, universally supported). */
export const ICO_SIZES = [16, 32, 48] as const
/** Standalone PNG outputs. */
export const PNG_SIZES = [180, 192, 512] as const

export const APPLE_TOUCH_SIZE = 180
export const MANIFEST_NAME = 'site.webmanifest'

/**
 * Build a `.ico` file embedding one PNG per size. Modern ICO containers with
 * PNG payloads open in browsers, Windows Explorer, macOS Finder, and GIMP —
 * no legacy BMP encoding needed.
 */
export function buildIco(images: PngAsset[]): Uint8Array {
  if (images.length === 0) throw new Error('ICO needs at least one image.')
  if (images.length > 255) throw new Error('ICO holds at most 255 images.')
  const headerLength = 6 + 16 * images.length
  const total = headerLength + images.reduce((sum, image) => sum + image.png.length, 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint16(0, 0, true) // reserved
  view.setUint16(2, 1, true) // type: icon
  view.setUint16(4, images.length, true)
  let offset = headerLength
  images.forEach(({ size, png }, i) => {
    const entry = 6 + 16 * i
    out[entry] = size >= 256 ? 0 : size
    out[entry + 1] = size >= 256 ? 0 : size
    out[entry + 2] = 0 // color count
    out[entry + 3] = 0 // reserved
    view.setUint16(entry + 4, 1, true) // planes
    view.setUint16(entry + 6, 32, true) // bit depth
    view.setUint32(entry + 8, png.length, true)
    view.setUint32(entry + 12, offset, true)
    out.set(png, offset)
    offset += png.length
  })
  return out
}

export interface IcoEntry {
  size: number
  bytes: number
  hasPngMagic: boolean
}

/** Parse an ICO back (used by tests and verification) — throws when invalid. */
export function parseIco(bytes: Uint8Array): IcoEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 6 || view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) {
    throw new Error('Not an ICO file.')
  }
  const count = view.getUint16(4, true)
  const entries: IcoEntry[] = []
  for (let i = 0; i < count; i++) {
    const entry = 6 + 16 * i
    if (entry + 16 > bytes.length) throw new Error('Truncated ICO directory.')
    const rawSize = bytes[entry]!
    const size = rawSize === 0 ? 256 : rawSize
    const length = view.getUint32(entry + 8, true)
    const offset = view.getUint32(entry + 12, true)
    if (offset + length > bytes.length) throw new Error('Truncated ICO image data.')
    const slice = bytes.slice(offset, offset + length)
    entries.push({
      size,
      bytes: length,
      hasPngMagic:
        slice.length >= 4 &&
        slice[0] === 0x89 &&
        slice[1] === 0x50 &&
        slice[2] === 0x4e &&
        slice[3] === 0x47,
    })
  }
  return entries
}

export interface ManifestIcon {
  src: string
  sizes: string
  type: string
  purpose?: string
}

/** Filenames produced by the tool (zip layout = site root). */
export const OUTPUT_FILES = {
  ico: 'favicon.ico',
  appleTouch: 'apple-touch-icon.png',
  icon192: 'icon-192.png',
  icon512: 'icon-512.png',
  manifest: MANIFEST_NAME,
} as const

export function buildManifest(appName: string): string {
  const name = appName.trim() || 'My App'
  const manifest = {
    name,
    short_name: name,
    icons: [
      { src: OUTPUT_FILES.icon192, sizes: '192x192', type: 'image/png' },
      { src: OUTPUT_FILES.icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ] as ManifestIcon[],
    display: 'standalone',
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

export function buildSnippet(): string {
  return [
    `<link rel="icon" href="/${OUTPUT_FILES.ico}" sizes="16x16 32x32 48x48">`,
    `<link rel="apple-touch-icon" href="/${OUTPUT_FILES.appleTouch}">`,
    `<link rel="manifest" href="/${OUTPUT_FILES.manifest}">`,
    '',
  ].join('\n')
}

/**
 * Largest centered square inside a w×h image (for non-square uploads).
 * Returns the crop box plus whether anything was cut.
 */
export function squareCrop(
  width: number,
  height: number,
): { x: number; y: number; edge: number; cropped: boolean } {
  const edge = Math.min(width, height)
  return {
    x: Math.round((width - edge) / 2),
    y: Math.round((height - edge) / 2),
    edge,
    cropped: width !== height,
  }
}
