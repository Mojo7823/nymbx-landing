export interface DecodeResult {
  bytes: Uint8Array
  /** UTF-8 decoding of `bytes`, absent when they are not valid text. */
  text?: string
}

/** Multiple of 3 so chunk boundaries never split a base64 group. */
export const ENCODE_CHUNK = 3 * 256 * 1024

const utf8Encoder = new TextEncoder()
const strictUtf8Decoder = new TextDecoder('utf-8', { fatal: true })

export function encodeBytes(data: Uint8Array, urlSafe: boolean): string {
  let binary = ''
  for (let i = 0; i < data.length; i += 0x8000) {
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000))
  }
  const standard = btoa(binary)
  if (!urlSafe) return standard
  return standard.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function encodeText(text: string, urlSafe: boolean): string {
  return encodeBytes(utf8Encoder.encode(text), urlSafe)
}

export function decodeBase64(input: string): DecodeResult {
  const stripped = input.replace(/\s+/g, '')
  if (stripped === '') throw new Error('Input is empty.')

  const invalidAt = stripped.search(/[^A-Za-z0-9+/\-_=]/)
  if (invalidAt !== -1) {
    throw new Error(
      `Invalid base64: unexpected character ${invalidAt + 1} (“${stripped[invalidAt]}”).`,
    )
  }

  const body = stripped.replace(/=+$/, '').replaceAll('-', '+').replaceAll('_', '/')
  const misplacedPad = body.indexOf('=')
  if (misplacedPad !== -1) {
    throw new Error(`Invalid base64: unexpected character ${misplacedPad + 1} (“=”).`)
  }
  if (body.length % 4 === 1) {
    throw new Error('Invalid base64: the input has an impossible length.')
  }

  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  let text: string | undefined
  try {
    text = strictUtf8Decoder.decode(bytes)
  } catch {
    text = undefined
  }
  return { bytes, text }
}

/** Encode a file chunk by chunk so huge inputs never need one contiguous read. */
export async function fileToBase64(
  file: Blob,
  urlSafe: boolean,
  onProgress: (value: number) => void,
): Promise<string> {
  const parts: string[] = []
  for (let offset = 0; offset < file.size; offset += ENCODE_CHUNK) {
    const chunk = new Uint8Array(await file.slice(offset, offset + ENCODE_CHUNK).arrayBuffer())
    parts.push(encodeBytes(chunk, urlSafe))
    onProgress(Math.min(1, (offset + chunk.length) / file.size))
  }
  onProgress(1)
  return parts.join('')
}

export function toDataUri(base64: string, mime: string): string {
  return `data:${mime};base64,${base64}`
}

/** Accept either plain base64 or a full data URI; report the URI's MIME type. */
export function parseBase64Input(input: string): { base64: string; mime: string | undefined } {
  const trimmed = input.trim()
  const match = /^data:([^,]*?);base64,(.*)$/s.exec(trimmed)
  if (match) return { base64: match[2], mime: match[1] || 'application/octet-stream' }
  return { base64: trimmed, mime: undefined }
}
