import { fileTypeFromBuffer, type FileTypeResult } from 'file-type'

/** Context7/file-type's recommended partial-read size for common signatures. */
export const DETECTION_BYTES = 4100

export async function detectBytes(bytes: Uint8Array): Promise<FileTypeResult | undefined> {
  try {
    return await fileTypeFromBuffer(bytes)
  } catch {
    return undefined
  }
}

export async function detectFile(file: File): Promise<FileTypeResult | undefined> {
  const sampleSize = Math.min(file.size, DETECTION_BYTES)
  if (sampleSize === 0) return undefined
  const bytes = new Uint8Array(await file.slice(0, sampleSize).arrayBuffer())
  return detectBytes(bytes)
}
