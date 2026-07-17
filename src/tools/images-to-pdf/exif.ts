/**
 * EXIF orientation (1–8) from raw JPEG bytes; 1 (upright) when absent or
 * unparseable. Only the segment headers and IFD0 are walked — the scan never
 * touches compressed image data.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return 1
  let offset = 2
  while (offset + 4 <= bytes.length) {
    const marker = view.getUint16(offset)
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda || marker === 0xffd9) break
    const length = view.getUint16(offset + 2)
    if (length < 2 || offset + 2 + length > bytes.length) break
    if (marker === 0xffe1 && length >= 8 && hasExifHeader(bytes, offset + 4)) {
      return tiffOrientation(view, offset + 10, offset + 2 + length) ?? 1
    }
    offset += 2 + length
  }
  return 1
}

/** "Exif\0\0" at `at`. */
function hasExifHeader(bytes: Uint8Array, at: number): boolean {
  return (
    bytes[at] === 0x45 &&
    bytes[at + 1] === 0x78 &&
    bytes[at + 2] === 0x69 &&
    bytes[at + 3] === 0x66 &&
    bytes[at + 4] === 0 &&
    bytes[at + 5] === 0
  )
}

function tiffOrientation(view: DataView, start: number, end: number): number | null {
  if (start + 8 > end) return null
  const order = view.getUint16(start)
  const little = order === 0x4949
  if (!little && order !== 0x4d4d) return null
  if (view.getUint16(start + 2, little) !== 42) return null
  const ifd = start + view.getUint32(start + 4, little)
  if (ifd + 2 > end) return null
  const entries = view.getUint16(ifd, little)
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > end) return null
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little)
      return value >= 1 && value <= 8 ? value : null
    }
  }
  return null
}
