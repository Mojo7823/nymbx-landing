/**
 * Client-side JWT decode + optional signature verification (Web Crypto).
 * Nothing is sent over the network.
 */

export type TokenTimeStatus = 'ok' | 'expired' | 'not-yet-valid' | 'no-time-claims'

export interface TimeClaimInfo {
  claim: 'exp' | 'iat' | 'nbf'
  raw: number
  iso: string
  /** Human relative string, e.g. "2 hours ago" / "in 3 days". */
  relative: string
  /** Only exp/nbf carry validity; iat is informational. */
  flag?: 'expired' | 'not-yet-valid'
}

export interface DecodedJwt {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  headerJson: string
  payloadJson: string
  /** Compact serialization parts (signature may be empty for alg=none). */
  parts: { header: string; payload: string; signature: string }
  algorithm: string
  timeClaims: TimeClaimInfo[]
  timeStatus: TokenTimeStatus
}

export type VerifyStatus = 'valid' | 'invalid' | 'unsupported' | 'error'

export interface VerifyOutcome {
  status: VerifyStatus
  message: string
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/** Base64url → bytes. Padding is optional per JWT. */
export function base64UrlToBytes(input: string): Uint8Array {
  if (input === '') return new Uint8Array()
  if (!/^[A-Za-z0-9_-]+$/.test(input)) {
    throw new Error('Invalid base64url characters in token part.')
  }
  const padded = input + '==='.slice((input.length + 3) % 4)
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  let binary: string
  try {
    binary = atob(b64)
  } catch {
    throw new Error('Invalid base64url encoding in token part.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToJson(bytes: Uint8Array): Record<string, unknown> {
  let text: string
  try {
    text = textDecoder.decode(bytes)
  } catch {
    throw new Error('Token part is not valid UTF-8.')
  }
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new Error('Token part is not valid JSON.')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Token part must be a JSON object.')
  }
  return value as Record<string, unknown>
}

function pretty(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2)
}

function asEpochSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10)
  }
  return null
}

/** Compact relative phrasing for claim timestamps. */
export function formatRelative(epochSeconds: number, nowMs: number = Date.now()): string {
  const diffSec = Math.round(epochSeconds - nowMs / 1000)
  const abs = Math.abs(diffSec)
  const past = diffSec < 0
  const unit = (n: number, name: string) => {
    const rounded = Math.round(n)
    const label = rounded === 1 ? name : `${name}s`
    return past ? `${rounded} ${label} ago` : `in ${rounded} ${label}`
  }
  if (abs < 60) return past ? 'just now' : 'in under a minute'
  if (abs < 3600) return unit(abs / 60, 'minute')
  if (abs < 86400) return unit(abs / 3600, 'hour')
  if (abs < 86400 * 30) return unit(abs / 86400, 'day')
  if (abs < 86400 * 365) return unit(abs / (86400 * 30), 'month')
  return unit(abs / (86400 * 365), 'year')
}

function collectTimeClaims(
  payload: Record<string, unknown>,
  nowMs: number,
): { timeClaims: TimeClaimInfo[]; timeStatus: TokenTimeStatus } {
  const timeClaims: TimeClaimInfo[] = []
  let expired = false
  let notYetValid = false

  for (const claim of ['exp', 'iat', 'nbf'] as const) {
    if (!(claim in payload)) continue
    const raw = asEpochSeconds(payload[claim])
    if (raw === null) continue
    const info: TimeClaimInfo = {
      claim,
      raw,
      iso: new Date(raw * 1000).toISOString(),
      relative: formatRelative(raw, nowMs),
    }
    const nowSec = nowMs / 1000
    if (claim === 'exp' && nowSec >= raw) {
      info.flag = 'expired'
      expired = true
    } else if (claim === 'nbf' && nowSec < raw) {
      info.flag = 'not-yet-valid'
      notYetValid = true
    }
    timeClaims.push(info)
  }

  if (timeClaims.length === 0) {
    return { timeClaims, timeStatus: 'no-time-claims' }
  }
  // Expired takes precedence when both flags could apply.
  if (expired) return { timeClaims, timeStatus: 'expired' }
  if (notYetValid) return { timeClaims, timeStatus: 'not-yet-valid' }
  return { timeClaims, timeStatus: 'ok' }
}

/**
 * Decode a compact JWT (or JWS). Signature is not checked here —
 * call `verifyJwt` separately when a key is supplied.
 */
export function decodeJwt(token: string, nowMs: number = Date.now()): DecodedJwt {
  const trimmed = token.trim()
  if (trimmed === '') {
    throw new Error('Paste a JWT to decode.')
  }

  // Strip optional "Bearer " prefix people paste from Authorization headers.
  const compact = trimmed.replace(/^Bearer\s+/i, '').trim()
  const segments = compact.split('.')
  if (segments.length !== 3) {
    throw new Error(
      `Expected a compact JWT with 3 parts (header.payload.signature), got ${segments.length}.`,
    )
  }
  const [headerB64, payloadB64, signatureB64] = segments as [string, string, string]
  if (headerB64 === '' || payloadB64 === '') {
    throw new Error('Header and payload parts must not be empty.')
  }

  const header = bytesToJson(base64UrlToBytes(headerB64))
  const payload = bytesToJson(base64UrlToBytes(payloadB64))
  // Validate signature encoding even when empty (alg=none).
  base64UrlToBytes(signatureB64)

  const algorithm = typeof header.alg === 'string' && header.alg !== '' ? header.alg : 'unknown'
  const { timeClaims, timeStatus } = collectTimeClaims(payload, nowMs)

  return {
    header,
    payload,
    headerJson: pretty(header),
    payloadJson: pretty(payload),
    parts: { header: headerB64, payload: payloadB64, signature: signatureB64 },
    algorithm,
    timeClaims,
    timeStatus,
  }
}

/** Strip PEM armor and decode to DER bytes. */
export function pemToDer(pem: string): Uint8Array {
  const text = pem.trim()
  if (text === '') throw new Error('Public key is empty.')
  const match = text.match(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]+?)-----END \1-----/)
  if (!match) {
    throw new Error(
      'Public key must be PEM (-----BEGIN PUBLIC KEY----- … -----END PUBLIC KEY-----).',
    )
  }
  const label = match[1]!
  if (label !== 'PUBLIC KEY' && label !== 'RSA PUBLIC KEY') {
    throw new Error(
      `Unsupported PEM label “${label}”. Paste an SPKI public key (BEGIN PUBLIC KEY).`,
    )
  }
  if (label === 'RSA PUBLIC KEY') {
    throw new Error(
      'PKCS#1 RSA PUBLIC KEY is not supported. Convert to SPKI (BEGIN PUBLIC KEY) first.',
    )
  }
  const b64 = match[2]!.replace(/\s+/g, '')
  let binary: string
  try {
    binary = atob(b64)
  } catch {
    throw new Error('Public key PEM body is not valid base64.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

type HashName = 'SHA-256' | 'SHA-384' | 'SHA-512'

function hashForAlg(alg: string): HashName | null {
  if (alg.endsWith('256')) return 'SHA-256'
  if (alg.endsWith('384')) return 'SHA-384'
  if (alg.endsWith('512')) return 'SHA-512'
  return null
}

function signingInput(parts: DecodedJwt['parts']): Uint8Array<ArrayBuffer> {
  return textEncoder.encode(`${parts.header}.${parts.payload}`)
}

/** Copy into a fresh ArrayBuffer-backed view for SubtleCrypto BufferSource typing. */
function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

async function importHmacKey(secret: string, hash: HashName): Promise<CryptoKey> {
  if (secret === '') throw new Error('HMAC secret is empty.')
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: { name: hash } },
    false,
    ['verify'],
  )
}

async function importRsaPublicKey(pem: string, hash: HashName, name: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    asBufferSource(pemToDer(pem)),
    { name, hash: { name: hash } },
    false,
    ['verify'],
  )
}

async function importEcPublicKey(pem: string, alg: string): Promise<CryptoKey> {
  const curve =
    alg === 'ES256' ? 'P-256' : alg === 'ES384' ? 'P-384' : alg === 'ES512' ? 'P-521' : null
  if (!curve) throw new Error(`Unsupported ECDSA algorithm “${alg}”.`)
  return crypto.subtle.importKey(
    'spki',
    asBufferSource(pemToDer(pem)),
    { name: 'ECDSA', namedCurve: curve },
    false,
    ['verify'],
  )
}

/**
 * Verify the JWT signature with a shared secret (HS family) or PEM public key
 * (RS / PS / ES families). The algorithm is taken from the token header — the key must match.
 */
export async function verifyJwt(decoded: DecodedJwt, keyMaterial: string): Promise<VerifyOutcome> {
  const alg = decoded.algorithm
  if (alg === 'none' || alg === 'unknown') {
    return {
      status: 'unsupported',
      message:
        alg === 'none'
          ? 'Algorithm is “none”, so there is no signature to verify.'
          : 'Header is missing a usable “alg” field.',
    }
  }

  const hash = hashForAlg(alg)
  if (!hash) {
    return {
      status: 'unsupported',
      message: `Algorithm “${alg}” is not supported for verification.`,
    }
  }

  const sig = base64UrlToBytes(decoded.parts.signature)
  if (sig.length === 0) {
    return { status: 'invalid', message: 'Signature part is empty.' }
  }

  const data = signingInput(decoded.parts)
  const keyText = keyMaterial.trim()

  try {
    let key: CryptoKey
    let algorithm: AlgorithmIdentifier | EcdsaParams | RsaPssParams

    if (alg.startsWith('HS')) {
      key = await importHmacKey(keyText, hash)
      algorithm = { name: 'HMAC' }
    } else if (alg.startsWith('RS')) {
      key = await importRsaPublicKey(keyText, hash, 'RSASSA-PKCS1-v1_5')
      algorithm = { name: 'RSASSA-PKCS1-v1_5' }
    } else if (alg.startsWith('PS')) {
      key = await importRsaPublicKey(keyText, hash, 'RSA-PSS')
      const saltLength = hash === 'SHA-256' ? 32 : hash === 'SHA-384' ? 48 : 64
      algorithm = { name: 'RSA-PSS', saltLength }
    } else if (alg.startsWith('ES')) {
      key = await importEcPublicKey(keyText, alg)
      algorithm = { name: 'ECDSA', hash: { name: hash } }
    } else {
      return {
        status: 'unsupported',
        message: `Algorithm “${alg}” is not supported. Use HS256/384/512, RS*, PS*, or ES*.`,
      }
    }

    const ok = await crypto.subtle.verify(algorithm, key, asBufferSource(sig), data)
    return ok
      ? { status: 'valid', message: `Signature verified with ${alg}.` }
      : { status: 'invalid', message: `Signature verification failed for ${alg}.` }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Verification failed.'
    // SubtleCrypto often throws DOMException with opaque names — surface a clearer note.
    if (cause instanceof DOMException) {
      return {
        status: 'error',
        message: `Could not verify with the provided key (${cause.name}). Check that the key matches ${alg}.`,
      }
    }
    return { status: 'error', message }
  }
}
