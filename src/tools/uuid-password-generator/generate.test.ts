import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  entropyBits,
  generatePasswords,
  generateUlids,
  generateUuids,
  passwordCharset,
  type PasswordOptions,
} from './generate'

const DEFAULTS: PasswordOptions = {
  length: 16,
  lower: true,
  upper: true,
  digits: true,
  symbols: false,
  excludeAmbiguous: false,
}

describe('generateUuids', () => {
  it('produces RFC 4122 version-4 UUIDs', () => {
    for (const uuid of generateUuids(20)) {
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    }
  })

  it('produces 1000 unique values in bulk', () => {
    const uuids = generateUuids(1000)
    expect(new Set(uuids).size).toBe(1000)
  })
})

describe('generateUlids', () => {
  it('produces 26-character Crockford base32 ULIDs', () => {
    for (const ulid of generateUlids(20)) {
      expect(ulid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    }
  })

  it('produces 1000 unique, lexicographically sorted values in bulk', () => {
    const ulids = generateUlids(1000)
    expect(new Set(ulids).size).toBe(1000)
    expect([...ulids].sort()).toEqual(ulids)
  })

  it('encodes the current time in the first 10 characters', () => {
    const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
    const [ulid] = generateUlids(1)
    let time = 0
    for (const char of ulid!.slice(0, 10)) time = time * 32 + B32.indexOf(char)
    expect(Math.abs(time - Date.now())).toBeLessThan(5000)
  })
})

describe('passwordCharset', () => {
  it('assembles exactly the selected classes', () => {
    expect(passwordCharset({ ...DEFAULTS, upper: false, digits: false })).toBe(
      'abcdefghijklmnopqrstuvwxyz',
    )
    expect(passwordCharset({ ...DEFAULTS, lower: false, upper: false, digits: true })).toBe(
      '0123456789',
    )
  })

  it('drops ambiguous characters (0 O 1 l I) when asked', () => {
    const charset = passwordCharset({ ...DEFAULTS, excludeAmbiguous: true })
    for (const char of '0O1lI') expect(charset).not.toContain(char)
    expect(charset).toContain('a')
    expect(charset).toContain('2')
  })
})

describe('generatePasswords', () => {
  it('honors the requested length', () => {
    for (const password of generatePasswords(5, { ...DEFAULTS, length: 31 })) {
      expect(password).toHaveLength(31)
    }
  })

  it('uses only characters from the selected classes', () => {
    const options: PasswordOptions = { ...DEFAULTS, upper: false, symbols: false }
    const allowed = new Set(passwordCharset(options))
    for (const password of generatePasswords(50, options)) {
      for (const char of password) expect(allowed.has(char)).toBe(true)
    }
  })

  it('never emits ambiguous characters when excluded', () => {
    const options: PasswordOptions = { ...DEFAULTS, symbols: true, excludeAmbiguous: true }
    for (const password of generatePasswords(50, options)) {
      expect(password).not.toMatch(/[0O1lI]/)
    }
  })

  it('produces 1000 unique passwords in bulk', () => {
    const passwords = generatePasswords(1000, DEFAULTS)
    expect(new Set(passwords).size).toBe(1000)
  })

  it('throws when no character class is selected', () => {
    expect(() =>
      generatePasswords(1, { ...DEFAULTS, lower: false, upper: false, digits: false }),
    ).toThrow(/character class/i)
  })
})

describe('entropyBits', () => {
  it('is length × log2(charset size)', () => {
    // lower+upper+digits = 62 characters
    expect(entropyBits(DEFAULTS)).toBeCloseTo(16 * Math.log2(62), 5)
    // excluding 0 O 1 l I leaves 57
    expect(entropyBits({ ...DEFAULTS, excludeAmbiguous: true })).toBeCloseTo(16 * Math.log2(57), 5)
  })

  it('is zero when no class is selected', () => {
    expect(entropyBits({ ...DEFAULTS, lower: false, upper: false, digits: false })).toBe(0)
  })
})

describe('randomness source', () => {
  it('uses no Math.random anywhere in this tool (code check)', () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.test.ts')) continue
      const source = readFileSync(join(dir, file), 'utf8')
      expect(source, `${file} must not use Math.random`).not.toContain('Math.' + 'random')
    }
  })
})
