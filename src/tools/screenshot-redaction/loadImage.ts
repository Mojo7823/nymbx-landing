/**
 * Decoding an incoming screenshot.
 *
 * `imageOrientation: 'from-image'` bakes any EXIF orientation into the
 * pixels, so the working canvas is already upright and the re-encoded export
 * needs no orientation tag (it carries no metadata at all).
 */

export const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,image/gif,image/bmp'
/** Refuse anything larger; a screenshot never comes close. */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024

export async function decodeImage(source: Blob): Promise<ImageBitmap> {
  return await createImageBitmap(source, { imageOrientation: 'from-image' })
}

/** The first image file on a paste event, or null when there is none. */
export function imageFromPaste(event: ClipboardEvent): File | null {
  const data = event.clipboardData
  if (!data) return null

  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/')) return file
  }
  for (const item of Array.from(data.items)) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) return file
  }
  return null
}
