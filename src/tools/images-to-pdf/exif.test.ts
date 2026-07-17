import { describe, expect, it } from 'vitest'
import { jpegOrientation } from './exif'

/**
 * Minimal JPEG: SOI + APP1 Exif segment holding a single-entry IFD0 with the
 * orientation tag, in the requested byte order.
 */
function exifJpeg(orientation: number, little = false): Uint8Array {
  // TIFF block: 8-byte header + entry count (2) + one entry (12) + next-IFD (4)
  const tiff = new Uint8Array(26)
  const view = new DataView(tiff.buffer)
  view.setUint16(0, little ? 0x4949 : 0x4d4d)
  view.setUint16(2, 42, little)
  view.setUint32(4, 8, little) // IFD0 right after the header
  view.setUint16(8, 1, little) // one entry
  view.setUint16(10, 0x0112, little) // orientation tag
  view.setUint16(12, 3, little) // SHORT
  view.setUint32(14, 1, little) // count
  view.setUint16(18, orientation, little)
  view.setUint32(22, 0, little) // no next IFD

  const segmentLength = 2 + 6 + tiff.length
  const out = new Uint8Array(4 + 6 + tiff.length + 4)
  const outView = new DataView(out.buffer)
  outView.setUint16(0, 0xffd8) // SOI
  outView.setUint16(2, 0xffe1) // APP1
  outView.setUint16(4, segmentLength)
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6) // "Exif\0\0"
  out.set(tiff, 12)
  return out
}

describe('jpegOrientation', () => {
  it('reads big-endian orientation', () => {
    expect(jpegOrientation(exifJpeg(6))).toBe(6)
  })

  it('reads little-endian orientation', () => {
    expect(jpegOrientation(exifJpeg(3, true))).toBe(3)
  })

  it('reads every valid value', () => {
    for (let o = 1; o <= 8; o++) expect(jpegOrientation(exifJpeg(o))).toBe(o)
  })

  it('defaults to 1 for out-of-range values', () => {
    expect(jpegOrientation(exifJpeg(0))).toBe(1)
    expect(jpegOrientation(exifJpeg(9))).toBe(1)
  })

  it('defaults to 1 for a JPEG without EXIF', () => {
    // SOI + APP0 (JFIF-style) header only
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00])
    expect(jpegOrientation(bytes)).toBe(1)
  })

  it('defaults to 1 for non-JPEG bytes', () => {
    expect(jpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(1)
    expect(jpegOrientation(new Uint8Array())).toBe(1)
  })

  it('defaults to 1 for a truncated EXIF segment', () => {
    const truncated = exifJpeg(6).slice(0, 16)
    expect(jpegOrientation(truncated)).toBe(1)
  })

  it('works on a subarray view with a non-zero byte offset', () => {
    const jpeg = exifJpeg(8)
    const padded = new Uint8Array(jpeg.length + 4)
    padded.set(jpeg, 4)
    expect(jpegOrientation(padded.subarray(4))).toBe(8)
  })
})
