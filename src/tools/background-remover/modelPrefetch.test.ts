import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefetchLabel, prefetchModel, PrefetchCancelled, PrefetchError } from './modelPrefetch'

const CATALOG = {
  '/models/small': {
    size: 10,
    mime: 'application/octet-stream',
    chunks: [
      { hash: 'aaaa', offsets: [0, 6] },
      { hash: 'bbbb', offsets: [6, 10] },
    ],
  },
}

function streamOf(bytes: Uint8Array, holdMs = 0): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      if (holdMs > 0) await new Promise((r) => setTimeout(r, holdMs))
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

/** Never emits: simulates a stalled connection. Honors abort. */
function hungStream(signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      signal.addEventListener('abort', () => {
        try {
          controller.close()
        } catch {
          /* already closing */
        }
      })
    },
  })
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('model prefetch', () => {
  it('downloads every chunk and reports cumulative progress', async () => {
    const seen: Array<[number, number]> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('resources.json')) return jsonResponse(CATALOG)
        const size = String(url).endsWith('aaaa') ? 6 : 4
        return new Response(streamOf(new Uint8Array(size)), { status: 200 })
      }),
    )
    const controller = new AbortController()
    await prefetchModel(
      'https://site/models/',
      'small',
      (p) => seen.push([p.loaded, p.total]),
      controller.signal,
      {
        stallTimeoutMs: 1000,
      },
    )
    expect(seen[0]).toEqual([0, 10])
    expect(seen[seen.length - 1]).toEqual([10, 10])
    expect(seen.every(([, total]) => total === 10)).toBe(true)
  })

  it('retries a size-mismatched chunk, then throws a friendly error', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('resources.json')) return jsonResponse(CATALOG)
        calls++
        return new Response(streamOf(new Uint8Array(1)), { status: 200 }) // always short
      }),
    )
    const seen: number[] = []
    await expect(
      prefetchModel(
        'https://site/models/',
        'small',
        (p) => seen.push(p.loaded),
        new AbortController().signal,
        { stallTimeoutMs: 1000, maxAttempts: 2 },
      ),
    ).rejects.toThrow(PrefetchError)
    expect(calls).toBe(2) // first chunk attempted twice, then aborts
    // Partial bytes from failed attempts are rolled back, never exceed total.
    expect(seen.every((loaded) => loaded <= 10)).toBe(true)
  })

  it('treats a stalled chunk as a failure after the stall timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).endsWith('resources.json')) return jsonResponse(CATALOG)
        return new Response(hungStream(init?.signal as AbortSignal), { status: 200 })
      }),
    )
    await expect(
      prefetchModel(
        'https://site/models/',
        'small',
        () => undefined,
        new AbortController().signal,
        { stallTimeoutMs: 30, maxAttempts: 2 },
      ),
    ).rejects.toThrow(/stalled/)
  })

  it('aborting surfaces PrefetchCancelled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).endsWith('resources.json')) return jsonResponse(CATALOG)
        return new Response(hungStream(init?.signal as AbortSignal), { status: 200 })
      }),
    )
    const controller = new AbortController()
    const pending = prefetchModel(
      'https://site/models/',
      'small',
      () => undefined,
      controller.signal,
      {
        stallTimeoutMs: 5000,
      },
    )
    controller.abort()
    await expect(pending).rejects.toThrow(PrefetchCancelled)
  })

  it('formats the progress label with optional speed', () => {
    expect(prefetchLabel({ loaded: 108544, total: 88200000 })).toMatch(
      /Downloading AI model · .* of .*84/,
    )
    expect(prefetchLabel({ loaded: 1000, total: 2000 }, 500)).toMatch(/\/s$/)
  })
})
