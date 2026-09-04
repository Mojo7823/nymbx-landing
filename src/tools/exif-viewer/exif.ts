/**
 * Pure helpers for the EXIF viewer & stripper: JPEG segment surgery (true
 * lossless "strip all"), naming, GPS formatting, and display formatting.
 */

/** JPEG APPn markers (0xE0–0xEF) and COM (0xFE) only ever hold metadata. */
function isMetadataMarker(marker: number): boolean {
  return marker === 0xfe || (marker >= 0xe0 && marker <= 0xef)
}

/**
 * Remove every metadata segment (EXIF, XMP, ICC, Photoshop, comments, …)
 * from a JPEG without touching a single image byte: everything from the
 * first SOS (start-of-scan) marker to end-of-file is copied verbatim, so
 * progressive JPEGs with several scans survive intact.
 *
 * This is what "strip all" uses — unlike piexifjs, which only drops the
 * EXIF APP1 segment and would leave XMP/GPS-sidecars behind.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('Not a JPEG file.')
  }
  const kept: Uint8Array[] = [bytes.slice(0, 2)]
  let keptLength = 2
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break // corrupt — stop, keep the tail below
    const marker = bytes[offset + 1]!
    if (marker === 0xda) {
      // Start of scan: the rest (scan data, further scans, EOI) is image data.
      kept.push(bytes.slice(offset))
      keptLength += bytes.length - offset
      offset = bytes.length
      break
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(bytes.slice(offset, offset + 2))
      keptLength += 2
      offset += 2
      continue
    }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    if (length < 2 || offset + 2 + length > bytes.length) break
    if (!isMetadataMarker(marker)) {
      kept.push(bytes.slice(offset, offset + 2 + length))
      keptLength += 2 + length
    }
    offset += 2 + length
  }
  if (offset < bytes.length) {
    // Trailing bytes we could not parse (or a corrupt header): keep them so
    // we never destroy image data — stripping stays conservative.
    kept.push(bytes.slice(offset))
    keptLength += bytes.length - offset
  }
  const out = new Uint8Array(keptLength)
  let at = 0
  for (const part of kept) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** True when the bytes still carry an EXIF APP1 segment. */
export function hasExifSegment(bytes: Uint8Array): boolean {
  return findSegment(bytes, 0xe1, 'Exif\0\0')
}

/** True when any APP1 XMP block survives. */
export function hasXmpSegment(bytes: Uint8Array): boolean {
  return findSegment(bytes, 0xe1, 'http://ns.adobe.com/xap/1.0/\0')
}

function findSegment(bytes: Uint8Array, marker: number, header: string): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return false
    const current = bytes[offset + 1]!
    if (current === 0xda) return false // scan data starts — stop parsing
    if (current === 0xd8 || current === 0xd9 || (current >= 0xd0 && current <= 0xd7)) {
      offset += 2
      continue
    }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    if (length < 2 || offset + 2 + length > bytes.length) return false
    if (current === marker) {
      let match = header.length <= length - 2
      for (let i = 0; match && i < header.length; i++) {
        if (bytes[offset + 4 + i] !== header.charCodeAt(i)) match = false
      }
      if (match) return true
    }
    offset += 2 + length
  }
  return false
}

/** `photo.jpg` → `photo-stripped.jpg` (keeps the original extension). */
export function outputName(inputName: string): string {
  const dot = inputName.lastIndexOf('.')
  if (dot <= 0) return `${inputName || 'image'}-stripped`
  return `${inputName.slice(0, dot)}-stripped${inputName.slice(dot)}`
}

/** Decimal degrees → `50°17'58.6"N`-style string. */
export function decimalToDms(decimal: number, isLatitude: boolean): string {
  const hemisphere = isLatitude ? (decimal >= 0 ? 'N' : 'S') : decimal >= 0 ? 'E' : 'W'
  const abs = Math.abs(decimal)
  const degrees = Math.floor(abs)
  const minutes = Math.floor((abs - degrees) * 60)
  const seconds = ((abs - degrees) * 3600 - minutes * 60).toFixed(1)
  return `${degrees}°${minutes}'${seconds}"${hemisphere}`
}

export function googleMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
}

export function osmUrl(latitude: number, longitude: number): string {
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`
}

export const ORIENTATION_LABELS: Record<number, string> = {
  1: 'Normal',
  2: 'Flipped horizontally',
  3: 'Rotated 180°',
  4: 'Flipped vertically',
  5: 'Transposed',
  6: 'Rotated 90° clockwise',
  7: 'Transverse',
  8: 'Rotated 90° counter-clockwise',
}

/** Human-readable rendering of an exifr tag value for the metadata tables. */
export function formatTagValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value instanceof Date) return value.toLocaleString()
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    const length = value instanceof ArrayBuffer ? value.byteLength : value.byteLength
    return `<${length.toLocaleString('en-US')} bytes of binary data>`
  }
  if (Array.isArray(value)) {
    const shown = value
      .slice(0, 8)
      .map((v) => formatTagValue(v))
      .join(', ')
    return value.length > 8 ? `${shown}, … (+${value.length - 8} more)` : shown
  }
  try {
    const json = JSON.stringify(value)
    return json.length > 160 ? `${json.slice(0, 160)}…` : json
  } catch {
    return String(value)
  }
}
