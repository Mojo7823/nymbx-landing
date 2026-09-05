import { afterEach, describe, expect, it, vi } from 'vitest'
import { prefetchUrls, PrefetchCancelled, PrefetchError } from './prefetch'

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
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

function bodyOf(size: number): Response {
  return new Response(streamOf(new Uint8Array(size)), { status: 200 })
}

const ITEMS = [
  { url: 'https://site/a', size: 6 },
  { url: 'https://site/b', size: 4 },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('prefetchUrls', () => {
  it('downloads every item and reports cumulative progress against the summed total', async () => {
    const seen: Array<[number, number]> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => bodyOf(String(url).endsWith('/a') ? 6 : 4)),
    )
    await prefetchUrls(ITEMS, (p) => seen.push([p.loaded, p.total]), new AbortController().signal, {
      stallTimeoutMs: 1000,
    })
    expect(seen[0]).toEqual([0, 10])
    expect(seen[seen.length - 1]).toEqual([10, 10])
    expect(seen.every(([, total]) => total === 10)).toBe(true)
  })

  it('fetches sequentially, in order, once per item on the happy path', async () => {
    const order: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        order.push(String(url))
        return bodyOf(String(url).endsWith('/a') ? 6 : 4)
      }),
    )
    await prefetchUrls(ITEMS, () => undefined, new AbortController().signal, {
      stallTimeoutMs: 1000,
    })
    expect(order).toEqual(['https://site/a', 'https://site/b'])
  })

  it('rejects a body of the wrong length and retries it', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++
        return bodyOf(1) // always short
      }),
    )
    const seen: number[] = []
    await expect(
      prefetchUrls(ITEMS, (p) => seen.push(p.loaded), new AbortController().signal, {
        stallTimeoutMs: 1000,
        maxAttempts: 2,
      }),
    ).rejects.toThrow(PrefetchError)
    expect(calls).toBe(2) // first item attempted twice, then gives up
    // Partial bytes from failed attempts are rolled back, never exceed total.
    expect(seen.every((loaded) => loaded <= 10)).toBe(true)
    expect(seen[seen.length - 1]).toBe(0)
  })

  it('retries a stalled attempt and succeeds on the next one', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls++
        if (calls === 1)
          return new Response(hungStream(init!.signal as AbortSignal), { status: 200 })
        return bodyOf(String(url).endsWith('/a') ? 6 : 4)
      }),
    )
    const seen: Array<[number, number]> = []
    await prefetchUrls(ITEMS, (p) => seen.push([p.loaded, p.total]), new AbortController().signal, {
      stallTimeoutMs: 30,
      maxAttempts: 3,
    })
    expect(calls).toBe(3) // /a stalled, /a retried, /b
    expect(seen[seen.length - 1]).toEqual([10, 10])
  })

  it('gives up with a friendly PrefetchError once the attempts are exhausted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string | URL, init?: RequestInit) =>
          new Response(hungStream(init!.signal as AbortSignal), { status: 200 }),
      ),
    )
    await expect(
      prefetchUrls(ITEMS, () => undefined, new AbortController().signal, {
        stallTimeoutMs: 30,
        maxAttempts: 2,
      }),
    ).rejects.toThrow(/stalled after 2 attempts/)
  })

  it('surfaces a non-OK response as a failed attempt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    )
    await expect(
      prefetchUrls(ITEMS, () => undefined, new AbortController().signal, {
        stallTimeoutMs: 1000,
        maxAttempts: 1,
      }),
    ).rejects.toThrow(PrefetchError)
  })

  it('skips the size check when the server transparently decompressed the body', async () => {
    // Vite's preview server serves the pre-gzipped OCR language packs with
    // `Content-Encoding: gzip`, so fetch() yields the *decompressed* bytes and
    // a strict size check would reject a perfectly good download.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(streamOf(new Uint8Array(50)), {
            status: 200,
            headers: { 'content-encoding': 'gzip' },
          }),
      ),
    )
    const seen: Array<[number, number]> = []
    await prefetchUrls(ITEMS, (p) => seen.push([p.loaded, p.total]), new AbortController().signal, {
      stallTimeoutMs: 1000,
      maxAttempts: 1,
    })
    // Progress still tracks the declared sizes and never overshoots.
    expect(seen[seen.length - 1]).toEqual([10, 10])
    expect(seen.every(([loaded]) => loaded <= 10)).toBe(true)
  })

  it('aborting surfaces PrefetchCancelled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string | URL, init?: RequestInit) =>
          new Response(hungStream(init!.signal as AbortSignal), { status: 200 }),
      ),
    )
    const controller = new AbortController()
    const pending = prefetchUrls(ITEMS, () => undefined, controller.signal, {
      stallTimeoutMs: 5000,
    })
    controller.abort()
    await expect(pending).rejects.toThrow(PrefetchCancelled)
  })

  it('an empty item list resolves after one zero-progress tick', async () => {
    const seen: Array<[number, number]> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('should not fetch')
      }),
    )
    await prefetchUrls([], (p) => seen.push([p.loaded, p.total]), new AbortController().signal)
    expect(seen).toEqual([[0, 0]])
  })
})
