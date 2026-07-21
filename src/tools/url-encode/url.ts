export type EncodeMode = 'component' | 'full'

export interface QueryParam {
  key: string
  value: string
}

export interface ParsedUrl {
  href: string
  /** Scheme without the trailing colon, e.g. `https`. */
  protocol: string
  username?: string
  password?: string
  /** ASCII (punycode) form, as browsers send it on the wire. */
  hostname: string
  /** Unicode form of an IDN host; absent when it matches `hostname`. */
  unicodeHostname?: string
  port?: string
  /** Raw path as it appears in the URL. */
  pathname: string
  /** Percent-decoded path; absent when decoding fails or changes nothing. */
  decodedPathname?: string
  /** Decoded query parameters in order; repeated keys appear once per occurrence. */
  params: QueryParam[]
  /** Raw fragment without the leading `#`. */
  hash?: string
  /** Percent-decoded fragment; absent when decoding fails or changes nothing. */
  decodedHash?: string
  /** True when the input had no scheme and `https://` was assumed. */
  assumedProtocol: boolean
}

export function encodeUrlText(text: string, mode: EncodeMode): string {
  return mode === 'component' ? encodeURIComponent(text) : encodeURI(text)
}

export function decodeUrlText(text: string, mode: EncodeMode): string {
  const brokenEscape = /%(?![0-9A-Fa-f]{2})/.exec(text)
  if (brokenEscape) {
    throw new Error(
      `Invalid percent-encoding: “%” at character ${brokenEscape.index + 1} is not followed by two hex digits.`,
    )
  }
  try {
    return mode === 'component' ? decodeURIComponent(text) : decodeURI(text)
  } catch {
    throw new Error('Invalid percent-encoding: the encoded bytes are not valid UTF-8.')
  }
}

/** Matches a scheme per RFC 3986; `localhost:3000` also matches, handled below. */
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

export function parseUrl(input: string): ParsedUrl {
  const trimmed = input.trim()
  if (trimmed === '') throw new Error('Input is empty.')

  // Treat `host:port/...` shorthand as a host, and add https:// when no scheme.
  const looksLikeHostPort = /^[a-zA-Z][a-zA-Z0-9+.-]*:\d+(\/|\?|#|$)/.test(trimmed)
  const assumedProtocol = looksLikeHostPort || !SCHEME.test(trimmed)

  let url: URL
  try {
    url = new URL(assumedProtocol ? `https://${trimmed}` : trimmed)
  } catch {
    throw new Error('Not a valid URL — check the scheme, host and any special characters.')
  }

  const unicodeHostname = punycodeToUnicode(url.hostname)
  const params: QueryParam[] = []
  for (const [key, value] of url.searchParams) params.push({ key, value })

  const rawHash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash

  return {
    href: url.href,
    protocol: url.protocol.replace(/:$/, ''),
    username: url.username ? decodeSafely(url.username) : undefined,
    password: url.password ? decodeSafely(url.password) : undefined,
    hostname: url.hostname,
    unicodeHostname: unicodeHostname !== url.hostname ? unicodeHostname : undefined,
    port: url.port || undefined,
    pathname: url.pathname,
    decodedPathname: differentWhenDecoded(url.pathname),
    params,
    hash: rawHash || undefined,
    decodedHash: rawHash ? differentWhenDecoded(rawHash) : undefined,
    assumedProtocol,
  }
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function differentWhenDecoded(value: string): string | undefined {
  const decoded = decodeSafely(value)
  return decoded !== value ? decoded : undefined
}

// ── Punycode decoding (RFC 3492) ─────────────────────────────────────────
// Only decoding is needed: `new URL()` already produces the ASCII form, but
// the platform has no API for the reverse mapping shown in the parser UI.

const BASE = 36
const TMIN = 1
const TMAX = 26
const SKEW = 38
const DAMP = 700
const INITIAL_BIAS = 72
const INITIAL_N = 128

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1
  delta += Math.floor(delta / numPoints)
  let k = 0
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN))
    k += BASE
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW))
}

function decodePunycode(encoded: string): string {
  const output: number[] = []
  const lastDash = encoded.lastIndexOf('-')
  const basicLength = Math.max(lastDash, 0)
  for (let j = 0; j < basicLength; j++) {
    const code = encoded.charCodeAt(j)
    if (code >= 0x80) throw new Error('Invalid punycode: non-basic code point.')
    output.push(code)
  }

  let index = basicLength > 0 ? basicLength + 1 : 0
  let n = INITIAL_N
  let i = 0
  let bias = INITIAL_BIAS

  while (index < encoded.length) {
    const oldi = i
    for (let w = 1, k = BASE; ; k += BASE) {
      if (index >= encoded.length) throw new Error('Invalid punycode: truncated digit sequence.')
      const code = encoded.charCodeAt(index++)
      const digit =
        code >= 0x30 && code <= 0x39
          ? code - 0x30 + 26
          : code >= 0x41 && code <= 0x5a
            ? code - 0x41
            : code >= 0x61 && code <= 0x7a
              ? code - 0x61
              : BASE
      if (digit >= BASE) throw new Error('Invalid punycode: bad digit.')
      i += digit * w
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
      if (digit < t) break
      w *= BASE - t
    }
    bias = adapt(i - oldi, output.length + 1, oldi === 0)
    n += Math.floor(i / (output.length + 1))
    i %= output.length + 1
    if (n > 0x10ffff) throw new Error('Invalid punycode: code point out of range.')
    output.splice(i, 0, n)
    i++
  }
  return String.fromCodePoint(...output)
}

/** Convert `xn--` labels of a hostname back to unicode; invalid labels pass through. */
export function punycodeToUnicode(hostname: string): string {
  return hostname
    .split('.')
    .map((label) => {
      if (!label.toLowerCase().startsWith('xn--')) return label
      try {
        return decodePunycode(label.toLowerCase().slice(4))
      } catch {
        return label
      }
    })
    .join('.')
}
