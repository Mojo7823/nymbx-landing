import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeStatus, readOfflineManifest, type OfflineManifest } from './offlineStatus'

const manifest: OfflineManifest = {
  version: 'abc',
  total: 60,
  files: [
    { url: '/assets/index-a.js', size: 10 },
    { url: '/assets/DiffChecker-b.js', size: 20 },
    { url: '/assets/PdfMerge-c.js', size: 30 },
  ],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('computeStatus', () => {
  it('splits the manifest into cached and missing by path name', () => {
    const status = computeStatus(manifest, new Set(['/assets/index-a.js', '/assets/PdfMerge-c.js']))
    expect(status).toEqual({
      cachedCount: 2,
      totalCount: 3,
      cachedBytes: 40,
      totalBytes: 60,
      missing: [{ url: '/assets/DiffChecker-b.js', size: 20 }],
    })
  })

  it('reports nothing cached for an empty cache', () => {
    const status = computeStatus(manifest, new Set())
    expect(status.cachedCount).toBe(0)
    expect(status.cachedBytes).toBe(0)
    expect(status.missing).toHaveLength(3)
  })

  it('reports completion when every file is cached', () => {
    const status = computeStatus(manifest, new Set(manifest.files.map((f) => f.url)))
    expect(status.missing).toEqual([])
    expect(status.cachedBytes).toBe(status.totalBytes)
  })

  it('ignores cache entries that are not in the manifest', () => {
    const status = computeStatus(manifest, new Set(['/assets/stale-x.js']))
    expect(status.cachedCount).toBe(0)
  })
})

describe('readOfflineManifest', () => {
  it('returns the parsed manifest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 })),
    )
    await expect(readOfflineManifest()).resolves.toEqual(manifest)
  })

  it('rejects a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    )
    await expect(readOfflineManifest()).rejects.toThrow('HTTP 404')
  })

  it('rejects a payload of the wrong shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ files: [{ url: 1 }] }), { status: 200 })),
    )
    await expect(readOfflineManifest()).rejects.toThrow('Malformed offline asset manifest')
  })
})
