/**
 * Streaming prefetcher for large, immutable static assets.
 *
 * Why this exists: the libraries that need multi-megabyte assets (the
 * background-removal model shards, the tesseract.js WASM core and language
 * packs) fetch them themselves, report progress per *completed* file at best,
 * and have no timeout — on a slow or stalling connection the UI sits at
 * "106 KB of 84.1 MB, 0%" forever. Downloading the same URLs here first gives
 * continuous byte-level progress, a per-file stall watchdog with retries and a
 * working Cancel button. The files are served `immutable`, so the library's own
 * fetch immediately afterwards resolves from the browser HTTP cache.
 */

export interface PrefetchItem {
  url: string
  /**
   * Exact byte size on disk. A body of a different length fails the attempt,
   * unless the response was content-encoded (see `fetchOne`).
   */
  size: number
}

export interface PrefetchProgress {
  loaded: number
  total: number
}

export interface PrefetchOptions {
  /** No data received for this long → the attempt counts as stalled. */
  stallTimeoutMs?: number
  /** Attempts per file before giving up. */
  maxAttempts?: number
}

export const DEFAULT_STALL_TIMEOUT_MS = 30_000
export const DEFAULT_MAX_ATTEMPTS = 3

export class PrefetchError extends Error {}
export class PrefetchCancelled extends PrefetchError {}

/**
 * One watchdog promise per attempt: re-arming the timer keeps the same promise
 * pending, so a fired-then-superseded timer can never surface as an unhandled
 * rejection.
 */
function stallGuard(ms: number): { promise: Promise<never>; reset: () => void; clear: () => void } {
  let rejectFn: (cause: Error) => void = () => undefined
  let id: ReturnType<typeof setTimeout> | undefined
  const arm = () => {
    if (id !== undefined) clearTimeout(id)
    id = setTimeout(() => rejectFn(new Error('stalled')), ms)
  }
  const promise = new Promise<never>((_, reject) => {
    rejectFn = reject
  })
  arm()
  return { promise, reset: arm, clear: () => clearTimeout(id) }
}

/**
 * Fetch one file with streaming progress and stall detection: if no bytes
 * arrive for `stallTimeoutMs` the attempt is aborted so the caller can retry
 * instead of hanging forever (the failure mode this module exists to fix).
 */
async function fetchOne(
  url: string,
  expectedSize: number,
  onBytes: (bytes: number) => void,
  signal: AbortSignal,
  stallTimeoutMs: number,
): Promise<Blob> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  // A content-encoded response is decompressed transparently by the browser,
  // so what we read is not what the file on disk weighs and the size check
  // below would always fail. Vite's preview server does exactly this for the
  // pre-gzipped OCR language packs (`.gz` → `Content-Encoding: gzip`); Caddy
  // serves them raw. Trust the declared size for progress either way, and only
  // assert it when the bytes really are the file's bytes.
  const encoded = (response.headers.get('content-encoding') ?? 'identity') !== 'identity'
  if (!response.body) {
    // Should not happen for GET 200, but stay correct if it does.
    const blob = await response.blob()
    onBytes(blob.size)
    return blob
  }
  const reader = response.body.getReader()
  const parts: BlobPart[] = []
  const guard = stallGuard(stallTimeoutMs)
  try {
    for (;;) {
      const read = await Promise.race([reader.read(), guard.promise])
      if (read.done) break
      // Cancel the reader on external abort so the connection closes promptly.
      if (signal.aborted) {
        throw new DOMException('aborted', 'AbortError')
      }
      parts.push(read.value)
      onBytes(read.value.byteLength)
      guard.reset()
    }
  } catch (cause) {
    await reader.cancel().catch(() => undefined)
    throw cause
  } finally {
    guard.clear()
    reader.releaseLock()
  }
  const blob = new Blob(parts)
  if (!encoded && blob.size !== expectedSize) {
    throw new Error(`size mismatch (expected ${expectedSize}, got ${blob.size})`)
  }
  return blob
}

/**
 * Download every item sequentially with cumulative byte progress, per-file
 * stall timeouts and retries. Bytes from a failed attempt are rolled back so
 * the retry never double-counts them and the bar stays monotonic.
 *
 * Rejects with `PrefetchCancelled` when `signal` aborts and with
 * `PrefetchError` (user-facing message) when a file exhausts its attempts.
 */
export async function prefetchUrls(
  items: PrefetchItem[],
  onProgress: (progress: PrefetchProgress) => void,
  signal: AbortSignal,
  options: PrefetchOptions = {},
): Promise<void> {
  const stallTimeoutMs = options.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  const throwIfCancelled = () => {
    if (signal.aborted) throw new PrefetchCancelled('cancelled')
  }

  const total = items.reduce((sum, item) => sum + item.size, 0)
  let loaded = 0
  onProgress({ loaded, total })

  for (const item of items) {
    let lastError: unknown = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      throwIfCancelled()
      const attemptStart = loaded
      let itemBytes = 0
      try {
        await fetchOne(
          item.url,
          item.size,
          (bytes) => {
            // Each item contributes at most its declared size, so a
            // transparently decompressed body cannot push the bar past 100%.
            itemBytes += bytes
            loaded = attemptStart + Math.min(itemBytes, item.size)
            onProgress({ loaded, total })
          },
          signal,
          stallTimeoutMs,
        )
        loaded = attemptStart + item.size
        onProgress({ loaded, total })
        lastError = null
        break
      } catch (cause) {
        loaded = attemptStart
        onProgress({ loaded, total })
        throwIfCancelled()
        lastError = cause
      }
    }
    if (lastError !== null) {
      throw new PrefetchError(
        `Download stalled after ${maxAttempts} attempts. Check your connection and try again.`,
      )
    }
  }
}
