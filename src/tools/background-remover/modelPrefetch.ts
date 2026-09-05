import { transferLabel } from '../../lib/format'
import {
  PrefetchCancelled,
  PrefetchError,
  prefetchUrls,
  type PrefetchItem,
  type PrefetchOptions,
  type PrefetchProgress,
} from '../../lib/prefetch'

// Re-exported so the tool keeps importing its prefetch surface from one place.
export {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_STALL_TIMEOUT_MS,
  PrefetchCancelled,
  PrefetchError,
} from '../../lib/prefetch'
export type { PrefetchOptions, PrefetchProgress } from '../../lib/prefetch'

export type BgModel = 'small' | 'medium'

interface ChunkRef {
  hash: string
  offsets: [number, number]
}

interface ResourcesMap {
  [key: string]: { size: number; mime: string; chunks: ChunkRef[] }
}

/**
 * Download every shard of the selected background-removal model with
 * continuous progress, per-chunk stall timeouts, and retries.
 *
 * This is the catalog-reading half: it resolves `resources.json` into the
 * shard URLs and their exact sizes, then hands them to the shared streaming
 * downloader in `src/lib/prefetch.ts`, which carries the progress, stall and
 * retry behaviour (and the rationale for prefetching at all).
 */
export async function prefetchModel(
  publicPath: string,
  model: BgModel,
  onProgress: (progress: PrefetchProgress) => void,
  signal: AbortSignal,
  options: PrefetchOptions = {},
): Promise<void> {
  const metaResponse = await fetch(new URL('resources.json', publicPath), { signal }).catch(
    (cause: unknown) => {
      if (signal.aborted) throw new PrefetchCancelled('cancelled')
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

  const items: PrefetchItem[] = entry.chunks.map((chunk) => ({
    url: new URL(chunk.hash, publicPath).toString(),
    size: chunk.offsets[1] - chunk.offsets[0],
  }))
  await prefetchUrls(items, onProgress, signal, options)
}

/** `Downloading AI model · 12.4 MB of 84.1 MB` (+ speed when known). */
export function prefetchLabel(progress: PrefetchProgress, bytesPerSecond?: number): string {
  return `Downloading AI model · ${transferLabel(progress.loaded, progress.total, bytesPerSecond)}`
}
