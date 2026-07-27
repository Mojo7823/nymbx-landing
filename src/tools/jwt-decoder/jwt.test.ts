import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { base64UrlToBytes, decodeJwt, formatRelative, pemToDer, verifyJwt } from './jwt'

// Well-known jwt.io HS256 sample (secret = "your-256-bit-secret").
const HS256_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
  'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
const HS256_SECRET = 'your-256-bit-secret'

function b64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlJson(obj: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(obj)))
}

/** Build an unsigned compact JWT (signature left empty or provided). */
function makeToken(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  signature = '',
): string {
  return `${b64urlJson(header)}.${b64urlJson(payload)}.${signature}`
}

describe('base64UrlToBytes', () => {
  it('decodes without padding', () => {
    // "hi" → aGk
    expect([...base64UrlToBytes('aGk')]).toEqual([104, 105])
  })

  it('rejects non-base64url characters', () => {
    expect(() => base64UrlToBytes('abc+')).toThrow(/base64url/i)
  })
})

describe('decodeJwt', () => {
  it('decodes the jwt.io HS256 sample header and payload', () => {
    const decoded = decodeJwt(HS256_TOKEN)
    expect(decoded.algorithm).toBe('HS256')
    expect(decoded.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(decoded.payload).toEqual({
      sub: '1234567890',
      name: 'John Doe',
      iat: 1516239022,
    })
    expect(decoded.headerJson).toContain('"alg": "HS256"')
    expect(decoded.payloadJson).toContain('"name": "John Doe"')
  })

  it('strips a Bearer prefix', () => {
    const decoded = decodeJwt(`Bearer ${HS256_TOKEN}`)
    expect(decoded.payload.sub).toBe('1234567890')
  })

  it('flags an expired token', () => {
    const now = 1_700_000_000_000 // fixed
    const token = makeToken({ alg: 'none', typ: 'JWT' }, { exp: 1_600_000_000, sub: 'a' })
    const decoded = decodeJwt(token, now)
    expect(decoded.timeStatus).toBe('expired')
    expect(decoded.timeClaims.find((c) => c.claim === 'exp')?.flag).toBe('expired')
  })

  it('flags a not-yet-valid token via nbf', () => {
    const now = 1_700_000_000_000
    const token = makeToken({ alg: 'none' }, { nbf: 1_800_000_000, iat: 1_800_000_000 })
    const decoded = decodeJwt(token, now)
    expect(decoded.timeStatus).toBe('not-yet-valid')
    expect(decoded.timeClaims.find((c) => c.claim === 'nbf')?.flag).toBe('not-yet-valid')
  })

  it('marks a currently-valid token with exp in the future as ok', () => {
    const now = 1_700_000_000_000
    const token = makeToken({ alg: 'none' }, { exp: 1_800_000_000, iat: 1_600_000_000 })
    const decoded = decodeJwt(token, now)
    expect(decoded.timeStatus).toBe('ok')
    expect(decoded.timeClaims).toHaveLength(2)
  })

  it('prefers expired over not-yet-valid when both apply', () => {
    // Pathological but possible: exp already passed and nbf still in the future.
    const now = 1_700_000_000_000
    const token = makeToken({ alg: 'none' }, { exp: 1_600_000_000, nbf: 1_800_000_000 })
    expect(decodeJwt(token, now).timeStatus).toBe('expired')
  })

  it('reports no-time-claims when exp/iat/nbf are absent', () => {
    const token = makeToken({ alg: 'none' }, { sub: 'x' })
    expect(decodeJwt(token).timeStatus).toBe('no-time-claims')
  })

  it('rejects malformed tokens with clear errors', () => {
    expect(() => decodeJwt('')).toThrow(/paste/i)
    expect(() => decodeJwt('onlyone')).toThrow(/3 parts/i)
    expect(() => decodeJwt('a.b')).toThrow(/3 parts/i)
    expect(() => decodeJwt('not!!!.payload.sig')).toThrow(/base64url/i)
    // Valid base64url that is not JSON.
    const junk = b64url(new TextEncoder().encode('not-json'))
    expect(() => decodeJwt(`${junk}.${junk}.`)).toThrow(/JSON/i)
  })

  it('rejects non-object JSON parts', () => {
    const arr = b64url(new TextEncoder().encode('[1,2]'))
    const obj = b64urlJson({ alg: 'none' })
    expect(() => decodeJwt(`${arr}.${obj}.`)).toThrow(/object/i)
  })
})

describe('formatRelative', () => {
  const now = 1_700_000_000_000

  it('describes past and future offsets', () => {
    expect(formatRelative(1_700_000_000 - 120, now)).toBe('2 minutes ago')
    expect(formatRelative(1_700_000_000 + 7200, now)).toBe('in 2 hours')
    expect(formatRelative(1_700_000_000 + 10, now)).toBe('in under a minute')
  })
})

describe('verifyJwt', () => {
  it('accepts the jwt.io HS256 sample with the correct secret', async () => {
    const decoded = decodeJwt(HS256_TOKEN)
    const result = await verifyJwt(decoded, HS256_SECRET)
    expect(result.status).toBe('valid')
  })

  it('rejects a tampered payload', async () => {
    const [h, , s] = HS256_TOKEN.split('.') as [string, string, string]
    const tamperedPayload = b64urlJson({
      sub: '1234567890',
      name: 'Evil Doe',
      iat: 1516239022,
    })
    const decoded = decodeJwt(`${h}.${tamperedPayload}.${s}`)
    const result = await verifyJwt(decoded, HS256_SECRET)
    expect(result.status).toBe('invalid')
  })

  it('rejects the wrong HMAC secret', async () => {
    const decoded = decodeJwt(HS256_TOKEN)
    const result = await verifyJwt(decoded, 'wrong-secret')
    expect(result.status).toBe('invalid')
  })

  it('reports unsupported for alg=none', async () => {
    const token = makeToken({ alg: 'none' }, { sub: 'x' })
    const result = await verifyJwt(decodeJwt(token), 'anything')
    expect(result.status).toBe('unsupported')
    expect(result.message).toMatch(/none/i)
  })

  it('verifies RS256 with a generated key pair', async () => {
    const { privateKey, publicKey } = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    )

    const header = b64urlJson({ alg: 'RS256', typ: 'JWT' })
    const payload = b64urlJson({ sub: 'rsa-test', iat: 1_700_000_000 })
    const data = new TextEncoder().encode(`${header}.${payload}`)
    const signature = new Uint8Array(
      await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, data),
    )
    const token = `${header}.${payload}.${b64url(signature)}`

    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', publicKey))
    let binary = ''
    for (const b of spki) binary += String.fromCharCode(b)
    const pem =
      '-----BEGIN PUBLIC KEY-----\n' +
      btoa(binary)
        .match(/.{1,64}/g)!
        .join('\n') +
      '\n-----END PUBLIC KEY-----'

    const decoded = decodeJwt(token)
    expect(await verifyJwt(decoded, pem)).toEqual({
      status: 'valid',
      message: 'Signature verified with RS256.',
    })

    // Tamper: flip one payload claim.
    const badPayload = b64urlJson({ sub: 'rsa-test', iat: 1_700_000_001 })
    const bad = decodeJwt(`${header}.${badPayload}.${b64url(signature)}`)
    expect((await verifyJwt(bad, pem)).status).toBe('invalid')
  })

  it('verifies ES256 with a generated key pair', async () => {
    const { privateKey, publicKey } = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )

    const header = b64urlJson({ alg: 'ES256', typ: 'JWT' })
    const payload = b64urlJson({ sub: 'es-test' })
    const data = new TextEncoder().encode(`${header}.${payload}`)
    const signature = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data),
    )
    const token = `${header}.${payload}.${b64url(signature)}`

    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', publicKey))
    let binary = ''
    for (const b of spki) binary += String.fromCharCode(b)
    const pem =
      '-----BEGIN PUBLIC KEY-----\n' +
      btoa(binary)
        .match(/.{1,64}/g)!
        .join('\n') +
      '\n-----END PUBLIC KEY-----'

    expect((await verifyJwt(decodeJwt(token), pem)).status).toBe('valid')
  })
})

describe('pemToDer', () => {
  it('rejects empty and non-PEM input', () => {
    expect(() => pemToDer('')).toThrow(/empty/i)
    expect(() => pemToDer('not-a-pem')).toThrow(/PEM/i)
  })

  it('rejects PKCS#1 RSA PUBLIC KEY labels', () => {
    const fake = '-----BEGIN RSA PUBLIC KEY-----\nMIIB\n-----END RSA PUBLIC KEY-----'
    expect(() => pemToDer(fake)).toThrow(/PKCS#1/i)
  })
})

describe('time claim ISO formatting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders iat as ISO UTC', () => {
    // 1516239022 → 2018-01-18T01:30:22.000Z
    const decoded = decodeJwt(HS256_TOKEN)
    const iat = decoded.timeClaims.find((c) => c.claim === 'iat')
    expect(iat?.iso).toBe('2018-01-18T01:30:22.000Z')
  })
})
