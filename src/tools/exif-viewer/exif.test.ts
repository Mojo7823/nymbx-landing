import { describe, expect, it } from 'vitest'
import piexif, { type ExifDict } from 'piexifjs'
import {
  decimalToDms,
  formatTagValue,
  hasExifSegment,
  hasXmpSegment,
  outputName,
  stripJpegMetadata,
} from './exif'
import { stripAllButOrientation, stripGpsOnly } from './strip'

/** Minimal JPEG shell (SOI + JFIF APP0 + SOS + one scan byte + EOI) to host crafted EXIF blocks. */
const SHELL_PREFIX = 'data:image/jpeg;base64,'

function shellJpeg(): string {
  const bytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00, 0xff,
    0xd9,
  ])
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `${SHELL_PREFIX}${btoa(binary)}`
}

function photoWithGps(): string {
  const dict: ExifDict = {
    '0th': { [piexif.ImageIFD.Make]: 'TestCam', [piexif.ImageIFD.Orientation]: 6 },
    Exif: { [piexif.ExifIFD.DateTimeOriginal]: '2024:01:02 03:04:05' },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: 'N',
      [piexif.GPSIFD.GPSLatitude]: [
        [50, 1],
        [17, 1],
        [586, 10],
      ],
      [piexif.GPSIFD.GPSLongitudeRef]: 'E',
      [piexif.GPSIFD.GPSLongitude]: [
        [14, 1],
        [49, 1],
        [13, 1],
      ],
    },
    Interop: {},
    '1st': {},
    thumbnail: null,
  }
  return piexif.insert(piexif.dump(dict), shellJpeg())
}

describe('selective JPEG stripping (piexif, lossless)', () => {
  it('removes only the GPS block, keeping orientation and camera tags', () => {
    const cleaned = stripGpsOnly(photoWithGps())
    const dict = piexif.load(cleaned)
    expect(Object.keys(dict.GPS)).toHaveLength(0)
    expect(dict['0th'][piexif.ImageIFD.Orientation]).toBe(6)
    expect(dict['0th'][piexif.ImageIFD.Make]).toBe('TestCam')
  })

  it('keeps only the orientation tag in keep-orientation mode', () => {
    const cleaned = stripAllButOrientation(photoWithGps())
    const dict = piexif.load(cleaned)
    expect(dict['0th']).toEqual({ [piexif.ImageIFD.Orientation]: 6 })
    expect(Object.keys(dict.GPS)).toHaveLength(0)
    expect(Object.keys(dict.Exif)).toHaveLength(0)
  })

  it('round-trips through remove+insert without corrupting the file', () => {
    const cleaned = stripGpsOnly(photoWithGps())
    expect(cleaned.startsWith(SHELL_PREFIX)).toBe(true)
    // Still a decodable EXIF block, just without GPS.
    expect(() => piexif.load(cleaned)).not.toThrow()
  })
})

describe('JPEG segment surgery (true strip-all)', () => {
  function jpegWithSegments(): Uint8Array {
    const exif = [
      0xff, 0xe1, 0x00, 0x0c, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    ]
    const xmp = [
      0xff,
      0xe1,
      0x00,
      0x22,
      ...'http://ns.adobe.com/xap/1.0/\0'.split('').map((c) => c.charCodeAt(0)),
      0x01,
      0x02,
    ]
    const dqt = [0xff, 0xdb, 0x00, 0x05, 0xaa, 0xbb, 0xcc]
    const sos = [0xff, 0xda, 0x00, 0x04, 0x11, 0x22, 0xde, 0xad, 0xbe, 0xef, 0xff, 0xd9]
    return new Uint8Array([0xff, 0xd8, ...exif, ...dqt, ...xmp, ...sos])
  }

  it('drops EXIF and XMP but keeps quantization tables and scan data', () => {
    const stripped = stripJpegMetadata(jpegWithSegments())
    expect(hasExifSegment(stripped)).toBe(false)
    expect(hasXmpSegment(stripped)).toBe(false)
    // DQT kept, SOS + scan bytes + EOI kept verbatim at the tail.
    expect([...stripped.slice(0, 9)]).toEqual([
      0xff, 0xd8, 0xff, 0xdb, 0x00, 0x05, 0xaa, 0xbb, 0xcc,
    ])
    expect([...stripped.slice(-6)]).toEqual([0xde, 0xad, 0xbe, 0xef, 0xff, 0xd9])
  })

  it('detects EXIF and XMP segments', () => {
    const bytes = jpegWithSegments()
    expect(hasExifSegment(bytes)).toBe(true)
    expect(hasXmpSegment(bytes)).toBe(true)
  })

  it('rejects non-JPEG input instead of corrupting it', () => {
    expect(() => stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toThrow('Not a JPEG')
  })
})

describe('naming, coordinates, and display formatting', () => {
  it('names stripped outputs after the input', () => {
    expect(outputName('photo.jpg')).toBe('photo-stripped.jpg')
    expect(outputName('scan.PNG')).toBe('scan-stripped.PNG')
    expect(outputName('noext')).toBe('noext-stripped')
  })

  it('formats decimal degrees as DMS', () => {
    expect(decimalToDms(50.2996, true)).toMatch(/^50°17'.*N$/)
    expect(decimalToDms(-14.82, false)).toMatch(/^14°.*W$/)
  })

  it('renders tag values readably without exploding on binary', () => {
    expect(formatTagValue('TestCam')).toBe('TestCam')
    expect(formatTagValue(400)).toBe('400')
    expect(formatTagValue(null)).toBe('—')
    expect(formatTagValue(new Uint8Array(300))).toMatch(/300 bytes/)
    expect(formatTagValue([1, 2, 3])).toBe('1, 2, 3')
  })
})
