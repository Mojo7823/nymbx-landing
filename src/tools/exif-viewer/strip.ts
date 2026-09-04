import piexif, { type ExifDict } from 'piexifjs'
import { stripJpegMetadata } from './exif'

export type StripMode = 'all' | 'gps' | 'keep-orientation'

export interface StripOutcome {
  /** Result as a `data:` URL in the input's mime type. */
  dataUrl: string
  /** Human-readable list of what was removed, for the result summary. */
  removed: string[]
  /** True when pixels were re-encoded (never for plain JPEG surgery). */
  reencoded: boolean
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',', 2)[1] ?? ''
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

/** EXIF orientation tag if present, else null. Never throws. */
export function readOrientation(dataUrl: string): number | null {
  try {
    const dict = piexif.load(dataUrl)
    const value = dict['0th']?.[piexif.ImageIFD.Orientation]
    return typeof value === 'number' ? value : null
  } catch {
    return null
  }
}

/** True when a GPS IFD with coordinates survives in the data URL. */
export function hasGps(dataUrl: string): boolean {
  try {
    const gps = piexif.load(dataUrl).GPS ?? {}
    return Object.keys(gps).length > 0
  } catch {
    return false
  }
}

function countEntries(dataUrl: string): {
  exifTags: number
  hasGps: boolean
  hasThumbnail: boolean
} {
  try {
    const dict = piexif.load(dataUrl)
    const count = (group: Record<number, unknown> | undefined): number =>
      group ? Object.keys(group).length : 0
    return {
      exifTags: count(dict['0th']) + count(dict.Exif) + count(dict.GPS) + count(dict.Interop),
      hasGps: Object.keys(dict.GPS ?? {}).length > 0,
      hasThumbnail: dict.thumbnail != null,
    }
  } catch {
    return { exifTags: 0, hasGps: false, hasThumbnail: false }
  }
}

/** Re-serialize `dict` back into a JPEG that currently has no EXIF. */
function reinsertStripped(dataUrl: string, dict: ExifDict): string {
  const exifBytes = piexif.dump(dict)
  return piexif.insert(exifBytes, piexif.remove(dataUrl))
}

/**
 * Remove only the GPS block from a JPEG, keeping every other tag
 * byte-identical (lossless).
 */
export function stripGpsOnly(dataUrl: string): string {
  const dict = piexif.load(dataUrl)
  const { GPS: _dropped, ...rest } = dict
  void _dropped
  return reinsertStripped(dataUrl, { ...rest, GPS: {} })
}

/**
 * Keep only the orientation tag (so the photo keeps displaying correctly)
 * and drop everything else (lossless).
 */
export function stripAllButOrientation(dataUrl: string): string {
  const orientation = readOrientation(dataUrl)
  const kept: ExifDict = {
    '0th': {},
    Exif: {},
    GPS: {},
    Interop: {},
    '1st': {},
    thumbnail: null,
  }
  if (orientation !== null && orientation !== 1) {
    kept['0th'] = { [piexif.ImageIFD.Orientation]: orientation }
  }
  return reinsertStripped(dataUrl, kept)
}

export interface JpegStripPlan {
  mode: StripMode
  orientation: number | null
}

/**
 * Strip a JPEG according to `mode`.
 * - `all` with no rotation tag: segment surgery (lossless, drops EXIF+XMP+…).
 * - `all` with a rotation tag: pixels are re-encoded with the rotation baked
 *   in (otherwise the photo would display sideways); the UI must say so.
 * - `gps` / `keep-orientation`: piexif dict surgery (lossless).
 */
export async function stripJpeg(
  dataUrl: string,
  mode: StripMode,
  bakeRotation: (dataUrl: string) => Promise<string>,
): Promise<StripOutcome> {
  const before = countEntries(dataUrl)
  const orientation = readOrientation(dataUrl)

  if (mode === 'gps') {
    return {
      dataUrl: stripGpsOnly(dataUrl),
      removed: ['GPS coordinates'],
      reencoded: false,
    }
  }
  if (mode === 'keep-orientation') {
    const removed = ['GPS coordinates', 'camera and exposure tags']
    if (before.hasThumbnail) removed.push('embedded thumbnail')
    if (orientation === null || orientation === 1) removed.push('rotation tag (was already normal)')
    return { dataUrl: stripAllButOrientation(dataUrl), removed, reencoded: false }
  }
  if (orientation !== null && orientation !== 1) {
    return {
      dataUrl: await bakeRotation(dataUrl),
      removed: ['all metadata (rotation baked into pixels by re-encoding)'],
      reencoded: true,
    }
  }
  const removed = ['all EXIF tags', 'GPS coordinates', 'XMP and other metadata blocks']
  if (before.hasThumbnail) removed.push('embedded thumbnail')
  if (before.exifTags === 0) removed.push('(this file had almost nothing to remove)')
  return {
    dataUrl: bytesToDataUrl(stripJpegMetadata(dataUrlToBytes(dataUrl)), 'image/jpeg'),
    removed,
    reencoded: false,
  }
}
