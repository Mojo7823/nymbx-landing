import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import {
  concatBytes,
  findEndOfCentralDirectory,
  parseCentralDirectory,
  planCreateEntries,
  sanitizeEntryName,
  withDirectoryEntries,
} from './zipEntries'

function fixture(): Uint8Array {
  return zipSync({
    'hello.txt': strToU8('Hello!'),
    'docs/notes.txt': strToU8('nested file'),
    'docs/空.txt': strToU8('unicode name'),
    'empty-dir/': new Uint8Array(0),
    'empty.bin': new Uint8Array(0),
  })
}

function metaOf(archive: Uint8Array) {
  return findEndOfCentralDirectory(archive)
}

describe('sanitizeEntryName', () => {
  it.each([
    ['a/b.txt', 'a/b.txt'],
    ['a\\b\\c.txt', 'a/b/c.txt'],
    ['/absolute/path.txt', 'absolute/path.txt'],
    ['C:\\Users\\x\\a.txt', 'Users/x/a.txt'],
    ['a/./b.txt', 'a/b.txt'],
    ['a/b/../c.txt', 'a/c.txt'],
    ['../../evil.txt', 'evil.txt'],
    ['a//b.txt', 'a/b.txt'],
    ['docs/', 'docs/'],
    ['../..', ''],
    ['.../.../...', '.../.../...'],
    ['空 dir/✓.txt', '空 dir/✓.txt'],
  ])('maps %j to %j', (raw, expected) => {
    expect(sanitizeEntryName(raw)).toBe(expected)
  })
})

describe('planCreateEntries', () => {
  it('passes clean inputs through', () => {
    const plan = planCreateEntries([
      { name: 'a.txt', path: 'a.txt' },
      { name: 'b.jpg', path: 'photos/b.jpg' },
    ])
    expect(plan.hasBlocking).toBe(false)
    expect(plan.rows.map((r) => r.entryName)).toEqual(['a.txt', 'photos/b.jpg'])
  })

  it('flags duplicates created by separator normalization', () => {
    const plan = planCreateEntries([
      { name: 'a.txt', path: 'x/a.txt' },
      { name: 'b.txt', path: 'x\\a.txt' },
    ])
    expect(plan.hasBlocking).toBe(true)
    expect(plan.rows.map((r) => r.status)).toEqual(['duplicate', 'duplicate'])
    expect(plan.rows[0]!.reason).toContain('x\\a.txt')
  })

  it('flags file/folder path collisions on both rows', () => {
    const plan = planCreateEntries([
      { name: 'a', path: 'a' },
      { name: 'b.txt', path: 'a/b.txt' },
    ])
    expect(plan.rows.map((r) => r.status)).toEqual(['duplicate', 'duplicate'])
    expect(plan.rows[0]!.reason).toContain('folder path')
  })

  it('flags names that sanitize to nothing', () => {
    const plan = planCreateEntries([{ name: 'x', path: '../..' }])
    expect(plan.rows[0]!.status).toBe('invalid')
    expect(plan.hasBlocking).toBe(true)
  })

  it('falls back to the file name when no path is given', () => {
    const plan = planCreateEntries([{ name: 'solo.txt', path: '' }])
    expect(plan.rows[0]!.entryName).toBe('solo.txt')
  })
})

describe('withDirectoryEntries', () => {
  it('adds every implied parent folder once, sorted', () => {
    expect(withDirectoryEntries(['a/b/c.txt', 'a/d.txt', 'top.txt'])).toEqual([
      'a/b/c.txt',
      'a/d.txt',
      'top.txt',
      'a/',
      'a/b/',
    ])
  })

  it('adds nothing for top-level files', () => {
    expect(withDirectoryEntries(['a.txt'])).toEqual(['a.txt'])
  })
})

describe('central directory parsing', () => {
  it('lists nested entries with sizes, flags folders, keeps unicode names', () => {
    const archive = fixture()
    const meta = metaOf(archive)
    expect(meta.entryCount).toBe(5)
    const entries = parseCentralDirectory(
      archive.slice(meta.cdOffset, meta.cdOffset + meta.cdSize),
      meta.entryCount,
    )
    const byName = new Map(entries.map((e) => [e.name, e]))
    expect(byName.get('hello.txt')?.size).toBe(6)
    expect(byName.get('docs/notes.txt')?.size).toBe(11)
    expect(byName.get('docs/空.txt')?.size).toBe(12)
    expect(byName.get('empty-dir/')?.isDirectory).toBe(true)
    expect(byName.get('empty.bin')).toMatchObject({ size: 0, isDirectory: false })
    expect(entries.every((e) => !e.encrypted)).toBe(true)
  })

  it('lists an empty archive as zero entries', () => {
    const archive = zipSync({})
    const meta = metaOf(archive)
    expect(meta.entryCount).toBe(0)
    expect(parseCentralDirectory(new Uint8Array(0), 0)).toEqual([])
  })

  it('detects the encryption flag', () => {
    const archive = new Uint8Array(fixture())
    const meta = metaOf(archive)
    const view = new DataView(archive.buffer)
    // General-purpose flag of the first central-directory header.
    view.setUint16(meta.cdOffset + 8, view.getUint16(meta.cdOffset + 8, true) | 0x1, true)
    const entries = parseCentralDirectory(
      archive.slice(meta.cdOffset, meta.cdOffset + meta.cdSize),
      meta.entryCount,
    )
    expect(entries[0]!.encrypted).toBe(true)
    expect(entries.slice(1).every((e) => !e.encrypted)).toBe(true)
  })

  it('rejects non-zip data and tiny files', () => {
    expect(() =>
      findEndOfCentralDirectory(
        new TextEncoder().encode('hello world, this is definitely not a zip file.....'),
      ),
    ).toThrow(/not a zip/i)
    expect(() => findEndOfCentralDirectory(new Uint8Array(10))).toThrow(/too small/i)
  })

  it('rejects truncated central directories and bad signatures', () => {
    const archive = fixture()
    const meta = metaOf(archive)
    const cd = archive.slice(meta.cdOffset, meta.cdOffset + meta.cdSize)
    expect(() => parseCentralDirectory(cd.slice(0, 10), meta.entryCount)).toThrow(/truncated/i)
    const corrupt = new Uint8Array(cd)
    corrupt[0] = 0x00
    expect(() => parseCentralDirectory(corrupt, meta.entryCount)).toThrow(/corrupt/i)
  })

  it('rejects Zip64 markers instead of misreading huge sizes', () => {
    const archive = new Uint8Array(fixture())
    const eocd = archive.length - 22 // no comment in fflate output
    const view = new DataView(archive.buffer)
    view.setUint16(eocd + 8, 0xffff, true)
    view.setUint16(eocd + 10, 0xffff, true)
    expect(() => findEndOfCentralDirectory(archive)).toThrow(/zip64/i)
  })
})

describe('concatBytes', () => {
  it('joins chunks in order', () => {
    expect(
      Array.from(concatBytes([new Uint8Array([1, 2]), new Uint8Array([]), new Uint8Array([3])])),
    ).toEqual([1, 2, 3])
    expect(concatBytes([])).toEqual(new Uint8Array(0))
  })
})
