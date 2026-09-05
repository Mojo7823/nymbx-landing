import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseManifest } from './manifest'
import {
  buildRows,
  commonRoot,
  isProblem,
  matchFiles,
  relativeToManifest,
  summarize,
  type FileLike,
  type FileStatus,
  type VerifyRow,
} from './verify'
import type { AlgorithmId } from './hashEngine'

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'src/tools/bulk-file-hasher/fixtures', name), 'utf8')
}

const manifest = parseManifest(fixture('SHA256SUMS'), 'SHA256SUMS')

/** Digests straight out of the fixture, so PASS rows use real values. */
const digests = new Map(manifest.entries.map((e) => [e.path, e.digest]))

const dropped: FileLike[] = manifest.entries.map((entry, i) => ({
  id: i + 1,
  path: `release/${entry.path}`,
  size: 10,
}))

function hashesFor(overrides: Record<number, string> = {}) {
  return (id: number): Partial<Record<AlgorithmId, string>> => {
    if (overrides[id] !== undefined) return { sha256: overrides[id] }
    const file = dropped.find((f) => f.id === id)!
    const digest = digests.get(file.path.replace(/^release\//, ''))
    return digest ? { sha256: digest } : {}
  }
}

const allDone = (): FileStatus => 'done'

describe('relativeToManifest', () => {
  it('strips the manifest folder from a dropped path', () => {
    expect(relativeToManifest('release/bin/tool.wasm', 'release/SHA256SUMS')).toBe('bin/tool.wasm')
  })

  it('leaves paths outside the manifest folder alone', () => {
    expect(relativeToManifest('other/x.bin', 'release/SHA256SUMS')).toBe('other/x.bin')
  })

  it('is a no-op for a manifest at the drop root or none at all', () => {
    expect(relativeToManifest('bin/tool.js', 'SHA256SUMS')).toBe('bin/tool.js')
    expect(relativeToManifest('./bin/tool.js', null)).toBe('bin/tool.js')
  })
})

describe('matchFiles', () => {
  it('matches identical paths without a matchedBy note', () => {
    const result = matchFiles(manifest.entries, [{ id: 7, path: 'bin/tool.wasm' }])
    expect(result.get(1)).toEqual({ id: 7 })
  })

  it('matches across separator styles', () => {
    const m = parseManifest(`${'a'.repeat(64)}  bin\\tool.js`)
    const result = matchFiles(m.entries, [{ id: 3, path: 'bin/tool.js' }])
    expect(result.get(0)).toEqual({ id: 3, matchedBy: 'separators' })
  })

  it('matches case-insensitively when nothing exact is left', () => {
    const m = parseManifest(`${'a'.repeat(64)}  BIN/Tool.js`)
    const result = matchFiles(m.entries, [{ id: 4, path: 'bin/tool.js' }])
    expect(result.get(0)).toEqual({ id: 4, matchedBy: 'case' })
  })

  it('falls back to a unique basename', () => {
    const result = matchFiles(manifest.entries, [{ id: 9, path: 'tool.wasm' }])
    expect(result.get(1)).toEqual({ id: 9, matchedBy: 'name' })
  })

  it('refuses the basename fallback when the basename is ambiguous', () => {
    const m = parseManifest(`${'a'.repeat(64)}  a/x.bin\n${'b'.repeat(64)}  b/x.bin`)
    const result = matchFiles(m.entries, [{ id: 1, path: 'somewhere/x.bin' }])
    expect(result.size).toBe(0)
  })
})

describe('buildRows', () => {
  it('reports every entry as PASS when the digests agree', () => {
    const rows = buildRows(manifest, dropped, {
      manifestPath: 'release/SHA256SUMS',
      hashes: hashesFor(),
      status: allDone,
    })
    expect(rows).toHaveLength(7)
    expect(rows.every((r) => r.status === 'pass')).toBe(true)
    expect(summarize(rows)).toMatchObject({ pass: 7, fail: 0, missing: 0, extra: 0, total: 7 })
  })

  it('reports FAIL with both digests when one file differs', () => {
    const wrong = 'f'.repeat(64)
    const rows = buildRows(manifest, dropped, {
      manifestPath: 'release/SHA256SUMS',
      hashes: hashesFor({ 3: wrong }),
      status: allDone,
    })
    const row = rows.find((r) => r.path === 'bin/tool.js')!
    expect(row.status).toBe('fail')
    expect(row.actual).toBe(wrong)
    expect(row.entry!.digest).toBe(digests.get('bin/tool.js'))
    expect(summarize(rows).fail).toBe(1)
  })

  it('reports MISSING entries and EXTRA files', () => {
    const files: FileLike[] = [
      { id: 1, path: 'release/README.md', size: 64 },
      { id: 2, path: 'release/notes.txt', size: 5 },
    ]
    const rows = buildRows(manifest, files, {
      manifestPath: 'release/SHA256SUMS',
      hashes: (id) => (id === 1 ? { sha256: digests.get('README.md')! } : {}),
      status: allDone,
    })
    const summary = summarize(rows)
    expect(summary).toMatchObject({ pass: 1, missing: 6, extra: 1 })
    expect(rows.at(-1)).toMatchObject({ status: 'extra', path: 'release/notes.txt' })
  })

  it('never reports a manifest file as EXTRA', () => {
    const files: FileLike[] = [
      { id: 1, path: 'release/README.md', size: 64 },
      { id: 2, path: 'release/MD5SUMS', size: 90 },
    ]
    const rows = buildRows(manifest, files, {
      manifestPath: 'release/SHA256SUMS',
      hashes: () => ({}),
      status: allDone,
      manifestFileIds: new Set([2]),
    })
    expect(rows.some((r) => r.status === 'extra')).toBe(false)
  })

  it('reports PENDING before the hash is computed and ERROR for unreadable files', () => {
    const files: FileLike[] = [
      { id: 1, path: 'release/README.md', size: 64 },
      { id: 2, path: 'release/bin/tool.js', size: 10 },
    ]
    const rows = buildRows(manifest, files, {
      manifestPath: 'release/SHA256SUMS',
      hashes: () => ({}),
      status: (id) => (id === 2 ? 'error' : 'queued'),
    })
    expect(rows.find((r) => r.path === 'README.md')!.status).toBe('pending')
    expect(rows.find((r) => r.path === 'bin/tool.js')!.status).toBe('error')
  })

  it('marks entries with an unsupported tag', () => {
    const m = parseManifest(`SHA3-256 (README.md) = ${'a'.repeat(64)}`)
    const rows = buildRows(m, [{ id: 1, path: 'README.md', size: 1 }], {
      hashes: () => ({ sha256: 'a'.repeat(64) }),
      status: allDone,
    })
    expect(rows[0]!.status).toBe('unsupported')
    expect(rows[0]!.note).toContain('SHA3-256')
  })

  it('carries the matched dropped path when the match was not exact', () => {
    const rows = buildRows(manifest, [{ id: 1, path: 'tool.wasm', size: 300000 }], {
      hashes: () => ({ sha256: digests.get('bin/tool.wasm')! }),
      status: allDone,
    })
    const row = rows.find((r) => r.path === 'bin/tool.wasm')!
    expect(row).toMatchObject({ status: 'pass', matchedBy: 'name', filePath: 'tool.wasm' })
  })

  it('verifies MD5 entries against the md5 hash', () => {
    const md5 = parseManifest(fixture('MD5SUMS'), 'MD5SUMS')
    const rows = buildRows(md5, [{ id: 1, path: 'README.md', size: 64 }], {
      hashes: () => ({ md5: md5.entries[0]!.digest }),
      status: allDone,
    })
    expect(rows[0]!.status).toBe('pass')
  })
})

describe('isProblem', () => {
  it('keeps failures, missing entries and errors only', () => {
    const statuses: VerifyRow['status'][] = [
      'pass',
      'fail',
      'missing',
      'extra',
      'pending',
      'unsupported',
      'error',
    ]
    const kept = statuses.filter((status) => isProblem({ status, path: 'x' }))
    expect(kept).toEqual(['fail', 'missing', 'error'])
  })
})

describe('commonRoot', () => {
  it('finds the folder every dropped path shares', () => {
    expect(commonRoot(['release/README.md', 'release/bin/tool.js'])).toBe('release')
  })

  it('returns null when a path is at the root or the roots differ', () => {
    expect(commonRoot(['README.md', 'release/bin/tool.js'])).toBeNull()
    expect(commonRoot(['a/x', 'b/y'])).toBeNull()
    expect(commonRoot([])).toBeNull()
  })
})
