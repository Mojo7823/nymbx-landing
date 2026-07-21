export interface PasswordOptions {
  length: number
  lower: boolean
  upper: boolean
  digits: boolean
  symbols: boolean
  /** Drop characters that are easy to misread: 0 O 1 l I. */
  excludeAmbiguous: boolean
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{}<>?'
const AMBIGUOUS = new Set('0O1lI')

export function generateUuids(count: number): string[] {
  return Array.from({ length: count }, () => crypto.randomUUID())
}

// ── ULID (spec: 48-bit ms timestamp + 80 random bits, Crockford base32) ──
// Implemented on crypto.getRandomValues directly: the ulid npm package ships
// a non-crypto PRNG fallback, which this tool's crypto-only guarantee forbids.

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function encodeTime(time: number): string {
  let out = ''
  for (let i = 0; i < 10; i++) {
    out = B32[time % 32] + out
    time = Math.floor(time / 32)
  }
  return out
}

/** 10 bytes (80 bits) → exactly 16 base32 characters. */
function encodeRandom(bytes: Uint8Array): string {
  let out = ''
  let value = 0
  let bits = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out
}

/** Big-endian increment, used to keep same-millisecond ULIDs monotonic. */
function increment(bytes: Uint8Array): void {
  for (let i = bytes.length - 1; i >= 0; i--) {
    if (bytes[i]! < 0xff) {
      bytes[i]!++
      return
    }
    bytes[i] = 0
  }
}

export function generateUlids(count: number): string[] {
  const ulids: string[] = []
  let lastTime = -1
  const random = new Uint8Array(10)
  for (let i = 0; i < count; i++) {
    const time = Date.now()
    if (time === lastTime) {
      increment(random)
    } else {
      crypto.getRandomValues(random)
      lastTime = time
    }
    ulids.push(encodeTime(time) + encodeRandom(random))
  }
  return ulids
}

// ── Passwords ────────────────────────────────────────────────────────────

export function passwordCharset(options: PasswordOptions): string {
  let charset = ''
  if (options.lower) charset += LOWER
  if (options.upper) charset += UPPER
  if (options.digits) charset += DIGITS
  if (options.symbols) charset += SYMBOLS
  if (options.excludeAmbiguous) {
    charset = [...charset].filter((char) => !AMBIGUOUS.has(char)).join('')
  }
  return charset
}

export function generatePasswords(count: number, options: PasswordOptions): string[] {
  const charset = passwordCharset(options)
  if (charset === '') throw new Error('Select at least one character class.')

  // Rejection sampling keeps every character equally likely (no modulo bias).
  const limit = 256 - (256 % charset.length)
  const pool = new Uint8Array(512)
  let poolIndex = pool.length

  function nextByte(): number {
    for (;;) {
      if (poolIndex === pool.length) {
        crypto.getRandomValues(pool)
        poolIndex = 0
      }
      const byte = pool[poolIndex++]!
      if (byte < limit) return byte
    }
  }

  return Array.from({ length: count }, () => {
    let password = ''
    for (let i = 0; i < options.length; i++) {
      password += charset[nextByte() % charset.length]
    }
    return password
  })
}

export function entropyBits(options: PasswordOptions): number {
  const size = passwordCharset(options).length
  return size === 0 ? 0 : options.length * Math.log2(size)
}
