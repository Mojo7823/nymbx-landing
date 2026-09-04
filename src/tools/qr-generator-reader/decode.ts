import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'

export interface DecodedCode {
  text: string
  format: string
}

let configured = false

function ensureConfigured(): void {
  if (configured) return
  // The reader WASM is self-hosted under public/zxing (see
  // scripts/copy-model-assets.mjs) so decoding never touches the library's
  // default jsDelivr CDN — the privacy invariant holds for this tool.
  prepareZXingModule({
    overrides: {
      locateFile: (file: string) => `/zxing/${file}`,
    },
  })
  configured = true
}

/** Largest dimension fed to the decoder; huge phone photos are downscaled. */
export const MAX_DECODE_DIMENSION = 2000

export function downscaleSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= MAX_DECODE_DIMENSION || longest <= 0) return { width, height }
  const scale = MAX_DECODE_DIMENSION / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Decode QR codes from raw pixels. `tryRotate` + `tryHarder` make tilted and
 * skewed photos decode; formats are restricted to QR so barcodes in the
 * background cannot shadow the code the user cares about.
 */
export async function decodeImageData(image: ImageData): Promise<DecodedCode[]> {
  ensureConfigured()
  const results = await readBarcodes(image, {
    formats: ['QRCode'],
    tryHarder: true,
    tryRotate: true,
  })
  return results.map((r) => ({ text: r.text, format: r.format }))
}

/** Decode the first frame-worthy pixels out of any dropped image file. */
export async function decodeImageFile(file: File): Promise<DecodedCode[]> {
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = downscaleSize(bitmap.width, bitmap.height)
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is not available in this browser.')
    context.drawImage(bitmap, 0, 0, width, height)
    return await decodeImageData(context.getImageData(0, 0, width, height))
  } finally {
    bitmap.close()
  }
}
