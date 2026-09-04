export const BYTES_PER_ROW = 16
export const WINDOW_BYTES = 64 * 1024
export const ROW_HEIGHT = 28
export const HEADER_HEIGHT = 32

const EXTENSION_ALIASES: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['jpg', 'jpeg']),
  new Set(['tif', 'tiff']),
  new Set(['htm', 'html']),
  new Set(['mpeg', 'mpg']),
  new Set(['oga', 'ogg']),
]

export interface VisibleRows {
  start: number
  end: number
}

export function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, '0').toUpperCase()
}

export function byteToAscii(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '·'
}

export function formatOffset(offset: number, fileSize = 0): string {
  const width = Math.max(8, Math.max(0, fileSize - 1).toString(16).length)
  return offset.toString(16).toUpperCase().padStart(width, '0')
}

export function parseOffsetInput(input: string, fileSize: number): number {
  const compact = input.trim().replaceAll('_', '')
  const value = compact.toLowerCase().startsWith('0x') ? compact.slice(2) : compact
  if (!value || !/^[0-9a-f]+$/i.test(value)) {
    throw new Error('Enter a hexadecimal offset, such as 1A0 or 0x1A0.')
  }
  const offset = Number.parseInt(value, 16)
  if (!Number.isSafeInteger(offset)) throw new Error('That offset is too large to navigate to.')
  if (fileSize === 0 || offset >= fileSize) {
    throw new Error(
      `Offset must be between 0 and ${formatOffset(Math.max(0, fileSize - 1), fileSize)}.`,
    )
  }
  return offset
}

export function parseByteSearch(input: string): Uint8Array {
  const withoutPrefixes = input.replace(/0x/gi, '')
  const compact = withoutPrefixes.replace(/[\s:,_-]/g, '')
  if (!compact) throw new Error('Enter one or more hexadecimal bytes, such as 89 50 4E 47.')
  if (!/^[0-9a-f]+$/i.test(compact)) {
    throw new Error('Search accepts hexadecimal bytes only (0–9 and A–F).')
  }
  if (compact.length % 2 !== 0) throw new Error('Each byte needs two hexadecimal digits.')
  if (compact.length > 512) throw new Error('Search sequences are limited to 256 bytes.')

  const bytes = new Uint8Array(compact.length / 2)
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byteToHex).join(' ')
}

export function filenameExtension(name: string): string | null {
  const lastSegment = name.split(/[\\/]/).at(-1) ?? name
  const dot = lastSegment.lastIndexOf('.')
  return dot > 0 && dot < lastSegment.length - 1 ? lastSegment.slice(dot + 1).toLowerCase() : null
}

export function extensionsMatch(filenameExt: string, detectedExt: string): boolean {
  const left = filenameExt.toLowerCase()
  const right = detectedExt.toLowerCase()
  if (left === right) return true
  return EXTENSION_ALIASES.some((aliases) => aliases.has(left) && aliases.has(right))
}

export function windowStartForOffset(offset: number): number {
  return Math.floor(offset / WINDOW_BYTES) * WINDOW_BYTES
}

export function visibleRows(
  scrollTop: number,
  viewportHeight: number,
  rowCount: number,
  overscan = 6,
): VisibleRows {
  const dataScrollTop = Math.max(0, scrollTop - HEADER_HEIGHT)
  const start = Math.max(0, Math.floor(dataScrollTop / ROW_HEIGHT) - overscan)
  const end = Math.min(
    rowCount,
    Math.ceil((dataScrollTop + viewportHeight) / ROW_HEIGHT) + overscan,
  )
  return { start, end }
}
