declare module 'piexifjs' {
  export interface ExifDict {
    '0th': Record<number, unknown>
    Exif: Record<number, unknown>
    GPS: Record<number, unknown>
    Interop: Record<number, unknown>
    '1st': Record<number, unknown>
    thumbnail: string | null
  }

  export const ImageIFD: Record<string, number>
  export const ExifIFD: Record<string, number>
  export const GPSIFD: Record<string, number>
  export const InteropIFD: Record<string, number>

  /** Parse the EXIF of a JPEG binary string or `data:image/jpeg;base64,…` URL. */
  export function load(data: string): ExifDict
  /** Serialize an EXIF dict to an EXIF binary string (without segment header). */
  export function dump(exifDict: ExifDict): string
  /** Remove the EXIF APP1 segment from a JPEG (binary string or data URL). */
  export function remove(jpeg: string): string
  /** Insert EXIF into a JPEG that has none (binary strings or data URLs). */
  export function insert(exif: string, jpeg: string): string

  const piexif: {
    load: typeof load
    dump: typeof dump
    remove: typeof remove
    insert: typeof insert
    ImageIFD: typeof ImageIFD
    ExifIFD: typeof ExifIFD
    GPSIFD: typeof GPSIFD
    InteropIFD: typeof InteropIFD
  }
  export default piexif
}
