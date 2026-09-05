import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  algorithmForDigest,
  algorithmForName,
  algorithmForTag,
  looksLikeManifestName,
  parseManifest,
  preferredManifest,
} from './manifest'

// Vitest runs from the repo root, and the fixtures are real checksum files
// written by coreutils / openssl — read them from disk rather than inlining.
function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'src/tools/bulk-file-hasher/fixtures', name), 'utf8')
}

describe('parseManifest — GNU untagged (SHA256SUMS)', () => {
  const manifest = parseManifest(fixture('SHA256SUMS'), 'SHA256SUMS')

  it('reads every entry with no warnings', () => {
    expect(manifest.entries).toHaveLength(7)
    expect(manifest.warnings).toEqual([])
    expect(manifest.format).toBe('gnu')
    expect(manifest.algorithms).toEqual(['sha256'])
  })

  it('keeps paths with sub-directories, spaces and non-ASCII names', () => {
    expect(manifest.entries.map((e) => e.path)).toEqual([
      'README.md',
      'bin/tool.wasm',
      'bin/tool.js',
      'empty.txt',
      'docs/sub dir/data with spaces.csv',
      'docs/名前 é.txt',
      'docs/back\\slash.txt',
    ])
  })

  it('unescapes the `\\`-prefixed line into a literal backslash name', () => {
    const escaped = manifest.entries.at(-1)!
    expect(escaped.path).toBe('docs/back\\slash.txt')
    expect(escaped.digest).toBe('36e4cc90f96511cb1f3f13c9201feb9293eb0c629fe423e7bfcefb00687e964b')
    expect(escaped.line).toBe(7)
  })

  it('marks text mode entries as non-binary', () => {
    expect(manifest.entries.every((e) => !e.binary)).toBe(true)
  })
})

describe('parseManifest — other fixture formats', () => {
  it('reads GNU binary mode (`*`)', () => {
    const m = parseManifest(fixture('SHA256SUMS.binary'), 'SHA256SUMS.binary')
    expect(m.entries.map((e) => [e.path, e.binary])).toEqual([
      ['README.md', true],
      ['bin/tool.wasm', true],
    ])
  })

  it('reads BSD tagged lines, including a name with spaces', () => {
    const m = parseManifest(fixture('SHA256SUMS.bsd'), 'SHA256SUMS.bsd')
    expect(m.format).toBe('bsd')
    expect(m.entries).toHaveLength(3)
    expect(m.entries[2]!.path).toBe('docs/sub dir/data with spaces.csv')
    expect(m.entries[2]!.tag).toBe('SHA256')
    expect(m.entries[2]!.algorithm).toBe('sha256')
  })

  it('reads OpenSSL `SHA2-256(name)= hex` lines', () => {
    const m = parseManifest(fixture('openssl.sha256'), 'openssl.sha256')
    expect(m.format).toBe('openssl')
    expect(m.algorithms).toEqual(['sha256'])
    expect(m.entries.map((e) => e.path)).toEqual(['README.md', 'bin/tool.js'])
  })

  it('reads a BLAKE2b tag', () => {
    const m = parseManifest(fixture('README.b2'), 'README.b2')
    expect(m.algorithms).toEqual(['blake2b'])
    expect(m.entries[0]!.digest).toHaveLength(128)
  })

  it('reads MD5SUMS', () => {
    const m = parseManifest(fixture('MD5SUMS'), 'MD5SUMS')
    expect(m.algorithms).toEqual(['md5'])
    expect(m.entries).toHaveLength(2)
  })

  it('ignores CRLF endings, comments and blank lines', () => {
    const m = parseManifest(fixture('with-missing.sha256'), 'with-missing.sha256')
    expect(m.warnings).toEqual([])
    expect(m.entries.map((e) => e.path)).toEqual(['README.md', 'bin/not-shipped.bin'])
    expect(m.entries[0]!.digest).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('parseManifest — edge cases', () => {
  it('strips a leading `./` and lowercases the digest', () => {
    const m = parseManifest(`${'A'.repeat(64)}  ./x/y.bin`)
    expect(m.entries[0]!.path).toBe('x/y.bin')
    expect(m.entries[0]!.digest).toBe('a'.repeat(64))
  })

  it('warns about lines that are not checksum lines and keeps going', () => {
    const m = parseManifest(`not a checksum\n${'a'.repeat(64)}  ok.txt`)
    expect(m.warnings).toEqual(['Line 1: not a checksum line'])
    expect(m.entries).toHaveLength(1)
  })

  it('keeps the first of duplicate paths and warns', () => {
    const m = parseManifest(`${'a'.repeat(64)}  x\n${'b'.repeat(64)}  x`)
    expect(m.entries).toHaveLength(1)
    expect(m.entries[0]!.digest).toBe('a'.repeat(64))
    expect(m.warnings).toEqual(['Line 2: duplicate entry for x (first one kept)'])
  })

  it('keeps unsupported tags as entries with a null algorithm', () => {
    const m = parseManifest(`SHA3-256 (README.md) = ${'a'.repeat(64)}`)
    expect(m.entries[0]!.algorithm).toBeNull()
    expect(m.entries[0]!.tag).toBe('SHA3-256')
    expect(m.algorithms).toEqual([])
  })

  it('reports `mixed` when both GNU and BSD lines appear', () => {
    const m = parseManifest(`${'a'.repeat(64)}  x\nSHA256 (y) = ${'b'.repeat(64)}`)
    expect(m.format).toBe('mixed')
  })

  it('returns no entries for text that holds none', () => {
    const m = parseManifest('hello\nworld')
    expect(m.entries).toEqual([])
    expect(m.algorithms).toEqual([])
  })

  it('names pasted text when no file name is given', () => {
    expect(parseManifest('').name).toBe('pasted text')
  })
})

describe('algorithm resolution precedence', () => {
  it('lets the tag win over the file name', () => {
    const m = parseManifest(`MD5 (x) = ${'a'.repeat(32)}`, 'SHA256SUMS')
    expect(m.entries[0]!.algorithm).toBe('md5')
  })

  it('lets the file name win over the digest length', () => {
    // 128 hex chars are SHA-512 by length, but `.b2` says BLAKE2b.
    const m = parseManifest(`${'a'.repeat(128)}  x`, 'README.b2')
    expect(m.entries[0]!.algorithm).toBe('blake2b')
  })

  it('falls back to the digest length for a generic manifest name', () => {
    const m = parseManifest(`${'a'.repeat(40)}  x`, 'CHECKSUMS')
    expect(m.entries[0]!.algorithm).toBe('sha1')
  })

  it('maps digest lengths and leaves SHA-224 unsupported', () => {
    expect(algorithmForDigest(8)).toBe('crc32')
    expect(algorithmForDigest(32)).toBe('md5')
    expect(algorithmForDigest(40)).toBe('sha1')
    expect(algorithmForDigest(64)).toBe('sha256')
    expect(algorithmForDigest(96)).toBe('sha384')
    expect(algorithmForDigest(128)).toBe('sha512')
    expect(algorithmForDigest(56)).toBeNull()
  })

  it('normalizes tags', () => {
    expect(algorithmForTag('SHA2-512')).toBe('sha512')
    expect(algorithmForTag('sha-1')).toBe('sha1')
    expect(algorithmForTag('BLAKE2b')).toBe('blake2b')
    expect(algorithmForTag('BLAKE2s')).toBeNull()
    expect(algorithmForTag('SHA512/256')).toBeNull()
  })

  it('reads algorithms from file names', () => {
    expect(algorithmForName('SHA256SUMS')).toBe('sha256')
    expect(algorithmForName('SHA256SUMS.txt')).toBe('sha256')
    expect(algorithmForName('release/checksums.sha1')).toBe('sha1')
    expect(algorithmForName('release.sha512')).toBe('sha512')
    expect(algorithmForName('CHECKSUMS')).toBeNull()
  })
})

describe('looksLikeManifestName', () => {
  it('accepts the well-known manifest names', () => {
    for (const name of [
      'SHA256SUMS',
      'SHA256SUMS.txt',
      'MD5SUMS',
      'B2SUMS',
      'CHECKSUMS',
      'checksums.sha1',
      'release.sha512',
      'README.b2',
      'openssl.sha256',
      'with-missing.sha256',
      'build.digests',
      'SHA256SUMS.bsd',
      'SHA256SUMS.binary',
    ]) {
      expect(looksLikeManifestName(name), name).toBe(true)
    }
  })

  it('rejects ordinary file names', () => {
    for (const name of ['README.md', 'bin/tool.wasm', 'notes.txt', 'data.csv']) {
      expect(looksLikeManifestName(name), name).toBe(false)
    }
  })
})

describe('preferredManifest', () => {
  it('picks the canonical, strongest manifest out of a release folder', () => {
    const found = [
      { name: 'with-missing.sha256' },
      { name: 'MD5SUMS' },
      { name: 'SHA256SUMS' },
      { name: 'SHA256SUMS.bsd' },
    ]
    expect(preferredManifest(found)).toEqual({ name: 'SHA256SUMS' })
  })

  it('adopts a lone non-canonical manifest', () => {
    expect(preferredManifest([{ name: 'release.sha512' }])).toEqual({ name: 'release.sha512' })
  })

  it('adopts nothing when several non-canonical manifests compete', () => {
    expect(preferredManifest([{ name: 'a.sha256' }, { name: 'b.sha256' }])).toBeNull()
  })

  it('adopts nothing for an empty list', () => {
    expect(preferredManifest([])).toBeNull()
  })
})
