import {
  createBLAKE3,
  createHMAC,
  createMD5,
  createSHA1,
  createSHA256,
  createSHA3,
  createSHA512,
  type IHasher,
} from 'hash-wasm'

export type AlgorithmId = 'sha256' | 'sha512' | 'sha1' | 'md5' | 'sha3-256' | 'sha3-512' | 'blake3'

export const ALGORITHM_LABELS: Record<AlgorithmId, string> = {
  sha256: 'SHA-256',
  sha512: 'SHA-512',
  sha1: 'SHA-1',
  md5: 'MD5',
  'sha3-256': 'SHA3-256',
  'sha3-512': 'SHA3-512',
  blake3: 'BLAKE3',
}

/** Display order for the algorithm tabs. */
export const ALGORITHM_ORDER: AlgorithmId[] = [
  'sha256',
  'sha512',
  'sha1',
  'md5',
  'sha3-256',
  'sha3-512',
  'blake3',
]

/** Algorithms that are broken for collision resistance — checksums only. */
export const LEGACY_ALGORITHMS: ReadonlySet<AlgorithmId> = new Set(['md5', 'sha1'])

export type KeyFormat = 'text' | 'hex'
export type OutputFormat = 'hex' | 'base64'

const utf8 = new TextEncoder()

const factories: Record<AlgorithmId, () => Promise<IHasher>> = {
  sha256: createSHA256,
  sha512: createSHA512,
  sha1: createSHA1,
  md5: createMD5,
  'sha3-256': () => createSHA3(256),
  'sha3-512': () => createSHA3(512),
  blake3: () => createBLAKE3(),
}

/**
 * Decode a hex string into key bytes. Whitespace is tolerated so keys can be
 * pasted in grouped form; anything else raises a clear error.
 */
export function parseHexKey(input: string): Uint8Array {
  const compact = input.replace(/\s+/g, '')
  if (compact === '') {
    throw new Error('Hex key is empty — enter at least one byte, e.g. "0a1f".')
  }
  if (/[^0-9a-fA-F]/.test(compact)) {
    throw new Error('Hex key may only contain digits 0–9 and letters a–f.')
  }
  if (compact.length % 2 !== 0) {
    throw new Error('Hex key needs an even number of digits — each byte is two digits.')
  }
  const bytes = new Uint8Array(compact.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(compact.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Both output formats are rendered from the same digest bytes, never re-hashed. */
function formatDigest(digest: Uint8Array, output: OutputFormat): string {
  return output === 'hex' ? bytesToHex(digest) : bytesToBase64(digest)
}

/** Hash `text`, always UTF-8 encoded, with the chosen algorithm. */
export async function hashText(
  text: string,
  algorithm: AlgorithmId,
  output: OutputFormat,
): Promise<string> {
  const hasher = await factories[algorithm]()
  hasher.init()
  hasher.update(utf8.encode(text))
  return formatDigest(hasher.digest('binary'), output)
}

/**
 * HMAC over `text` (UTF-8 encoded) per RFC 2104. A text key is UTF-8 encoded;
 * a hex key is decoded to raw bytes first — the two never mean the same thing.
 */
export async function hmacText(
  text: string,
  algorithm: AlgorithmId,
  key: string,
  keyFormat: KeyFormat,
  output: OutputFormat,
): Promise<string> {
  const keyBytes = keyFormat === 'hex' ? parseHexKey(key) : utf8.encode(key)
  const hmac = await createHMAC(factories[algorithm](), keyBytes)
  hmac.init()
  hmac.update(utf8.encode(text))
  return formatDigest(hmac.digest('binary'), output)
}

/**
 * Normalize a user-supplied expected digest: reduced to the first whitespace
 * token so a `sha256sum` output line can be pasted as-is. Hex compares
 * case-insensitively; base64 is case-sensitive and kept verbatim.
 */
export function normalizeExpected(input: string, output: OutputFormat): string {
  const token = input.trim().split(/\s+/)[0] ?? ''
  return output === 'hex' ? token.toLowerCase() : token
}
