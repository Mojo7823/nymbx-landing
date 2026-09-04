import { formatBytes } from '../../lib/format'

export type BgModel = 'small' | 'medium'

export interface PrefetchProgress {
  loaded: number
  total: number
}

export interface PrefetchOptions {
  /** No data received for this long → the attempt counts as stalled. */
  stallTimeoutMs?: number
  /** Attempts per chunk before giving up. */
  maxAttempts?: number
}

export const DEFAULT_STALL_TIMEOUT_MS = 30_000
export const DEFAULT_MAX_ATTEMPTS = 3

export class PrefetchError extends Error {}
export class PrefetchCancelled extends PrefetchError {}

interface ChunkRef {
  hash: string
  offsets: [number, number]
}

interface ResourcesMap {
  [key: string]: { size: number; mime: string; chunks: ChunkRef[] }
}

/**
 * One watchdog promise per chunk attempt: re-arming the timer keeps the same
 * promise pending, so a fired-then-superseded timer can never surface as an
 * unhandled rejection.
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
 * Fetch one chunk with streaming progress and stall detection: if no bytes
 * arrive for `stallTimeoutMs` the attempt is aborted so the caller can retry
 * instead of hanging forever (the failure mode this module exists to fix).
 */
async function fetchChunk(
  url: string,
  expectedSize: number,
  onBytes: (bytes: number) => void,
  signal: AbortSignal,
  stallTimeoutMs: number,
): Promise<Blob> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
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
  if (blob.size !== expectedSize) {
    throw new Error(`size mismatch (expected ${expectedSize}, got ${blob.size})`)
  }
  return blob
}

/**
 * Download every shard of the selected background-removal model with
 * continuous progress, per-chunk stall timeouts, and retries.
 *
 * Why this exists: the underlying library fetches all ~4 MB shards in
 * parallel and only reports progress per *completed* shard, with no timeout —
 * on a slow or stalling connection the UI sits at e.g. "106 KB of 84.1 MB 0%"
 * forever. Prefetching here warms the browser HTTP cache (chunk files are
 * content-hashed and served immutable), so the library's own fetch then
 * resolves from cache near-instantly.
 */
export async function prefetchModel(
  publicPath: string,
  model: BgModel,
  onProgress: (progress: PrefetchProgress) => void,
  signal: AbortSignal,
  options: PrefetchOptions = {},
): Promise<void> {
  const stallTimeoutMs = options.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  const throwIfCancelled = () => {
    if (signal.aborted) throw new PrefetchCancelled('cancelled')
  }

  const metaResponse = await fetch(new URL('resources.json', publicPath), { signal }).catch(
    (cause: unknown) => {
      throwIfCancelled()
      throw new PrefetchError(
        `Could not reach the model catalog: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    },
  )
  if (!metaResponse.ok) {
    throw new PrefetchError(`Model catalog returned HTTP ${metaResponse.status}.`)
  }
  const resources = (await metaResponse.json()) as ResourcesMap
  const entry = resources[`/models/${model}`]
  if (!entry) throw new PrefetchError(`Model "${model}" is missing from the catalog.`)

  const total = entry.size
  let loaded = 0
  onProgress({ loaded, total })

  for (const chunk of entry.chunks) {
    const expectedSize = chunk.offsets[1] - chunk.offsets[0]
    const url = new URL(chunk.hash, publicPath).toString()
    let lastError: unknown = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      throwIfCancelled()
      // A failed attempt may have reported partial bytes; roll back so the
      // retry does not double-count them.
      const attemptStart = loaded
      try {
        await fetchChunk(
          url,
          expectedSize,
          (bytes) => {
            loaded += bytes
            onProgress({ loaded: Math.min(loaded, total), total })
          },
          signal,
          stallTimeoutMs,
        )
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
        `Model download stalled after ${maxAttempts} attempts. Check your connection and try again.`,
      )
    }
  }
}

/** `Downloading AI model · 12.4 MB of 84.1 MB` (+ speed when known). */
export function prefetchLabel(progress: PrefetchProgress, bytesPerSecond?: number): string {
  const amounts = `${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}`
  const speed =
    bytesPerSecond !== undefined && bytesPerSecond > 0 ? ` · ${formatBytes(bytesPerSecond)}/s` : ''
  return `Downloading AI model · ${amounts}${speed}`
}
