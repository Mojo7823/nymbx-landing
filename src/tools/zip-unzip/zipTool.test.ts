import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { streamZip } from '../../lib/zipStream'
import { buildArchive, extractEntries, listArchive } from './zipTool'

async function archiveBlob(): Promise<Blob> {
  const bytes = zipSync({
    'hello.txt': strToU8('Hello!'),
    'docs/notes.txt': strToU8('nested file'),
    'docs/空.txt': strToU8('unicode name'),
    'images/': new Uint8Array(0),
  })
  return new Blob([bytes.slice().buffer], { type: 'application/zip' })
}

/**
 * Realm-safe byte comparison: Blobs cross the jsdom boundary, so the
 * resulting Uint8Arrays fail vitest's prototype-sensitive `toEqual`
 * (and huge arrays make its diff printer crawl).
 */
function expectBytes(actual: Uint8Array | undefined, expected: Uint8Array) {
  expect(actual?.length).toBe(expected.length)
  expect(actual != null && expected.every((byte, i) => byte === actual[i])).toBe(true)
}

describe('listArchive', () => {
  it('lists entries with sizes without decompressing', async () => {
    const entries = await listArchive(await archiveBlob())
    expect(entries.map((e) => e.name).sort()).toEqual([
      'docs/notes.txt',
      'docs/空.txt',
      'hello.txt',
      'images/',
    ])
    expect(entries.find((e) => e.name === 'hello.txt')?.size).toBe(6)
    expect(entries.find((e) => e.name === 'images/')?.isDirectory).toBe(true)
  })

  it('rejects non-zip files with a clear message', async () => {
    await expect(listArchive(new Blob(['plain text']))).rejects.toThrow(/not a zip/i)
    await expect(listArchive(new Blob([]))).rejects.toThrow(/too small/i)
  })
})

describe('extractEntries', () => {
  it('extracts only the wanted entries, byte-identical', async () => {
    const blob = await archiveBlob()
    const seen: number[] = []
    const result = await extractEntries(blob, ['docs/notes.txt', 'hello.txt'], (done) =>
      seen.push(done),
    )
    expect(result.errors).toEqual([])
    expect(result.files.map((f) => f.name).sort()).toEqual(['docs/notes.txt', 'hello.txt'])
    const byName = new Map(result.files.map((f) => [f.name, f.data]))
    expect(new TextDecoder().decode(byName.get('hello.txt'))).toBe('Hello!')
    expect(new TextDecoder().decode(byName.get('docs/notes.txt'))).toBe('nested file')
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.at(-1)).toBe(blob.size)
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })

  it('reads archives written in streaming fashion (data descriptors)', async () => {
    const payload = new TextEncoder().encode('streamed content here')
    const zipped = await streamZip([{ name: 's.txt', blob: new Blob([payload]) }])
    const result = await extractEntries(zipped, ['s.txt'])
    expect(result.errors).toEqual([])
    expectBytes(result.files[0]?.data, payload)
  })

  it('round-trips a 5 MiB pseudo-random payload through slices', async () => {
    const payload = new Uint8Array(5 * 1024 * 1024)
    let seed = 42
    for (let i = 0; i < payload.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      payload[i] = seed % 256
    }
    const zipped = await streamZip([{ name: 'big.bin', blob: new Blob([payload]) }])
    const result = await extractEntries(zipped, ['big.bin'])
    expect(result.errors).toEqual([])
    expectBytes(result.files[0]?.data, payload)
  })

  it('skips duplicate sanitized names with a collected error', async () => {
    const bytes = zipSync({
      'a/b.txt': strToU8('forward'),
      'a\\b.txt': strToU8('backward'),
    })
    const blob = new Blob([bytes.slice().buffer], { type: 'application/zip' })
    const result = await extractEntries(blob, ['a/b.txt'])
    expect(result.files).toHaveLength(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ name: 'a/b.txt' })
  })

  it('returns empty results for empty selections and empty archives', async () => {
    const blob = await archiveBlob()
    await expect(extractEntries(blob, [])).resolves.toEqual({ files: [], errors: [] })
    const empty = new Blob([zipSync({}).slice().buffer], { type: 'application/zip' })
    await expect(extractEntries(empty, ['missing.txt'])).resolves.toEqual({
      files: [],
      errors: [],
    })
  })
})

describe('buildArchive', () => {
  it('stores at level 0 and compresses at level 9', async () => {
    const text = new TextEncoder().encode('the quick brown fox jumps over '.repeat(2000))
    const blob = new Blob([text])
    const [stored, best] = await Promise.all([
      buildArchive([{ name: 't.txt', blob }], 0),
      buildArchive([{ name: 't.txt', blob }], 9),
    ])
    expect(stored.size).toBeGreaterThan(text.length)
    expect(best.size).toBeLessThan(stored.size / 10)
  })
})
