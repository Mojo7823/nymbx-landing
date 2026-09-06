import type { PrefetchItem } from '../lib/prefetch'
import { ASSET_CACHE, OFFLINE_ASSETS_URL, STATIC_CACHE } from './constants'

/** Shape of `offline-assets.json`, emitted by scripts/offlineAssets.ts at build time. */
export interface OfflineManifest {
  version: string
  total: number
  files: PrefetchItem[]
}

export interface OfflineStatus {
  cachedCount: number
  totalCount: number
  cachedBytes: number
  totalBytes: number
  /** Files not in the cache yet, in manifest order — feed straight to prefetchUrls. */
  missing: PrefetchItem[]
}

function isManifest(value: unknown): value is OfflineManifest {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<OfflineManifest>
  return (
    typeof candidate.version === 'string' &&
    typeof candidate.total === 'number' &&
    Array.isArray(candidate.files) &&
    candidate.files.every(
      (file) =>
        typeof file === 'object' &&
        file !== null &&
        typeof file.url === 'string' &&
        typeof file.size === 'number',
    )
  )
}

/**
 * The build-time asset catalog. Same-origin and served `no-cache`, so this is
 * a normal fetch — the service worker's NetworkFirst catalog route keeps a
 * copy for offline reads.
 */
export async function readOfflineManifest(signal?: AbortSignal): Promise<OfflineManifest> {
  const response = await fetch(OFFLINE_ASSETS_URL, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data: unknown = await response.json()
  if (!isManifest(data)) throw new Error('Malformed offline asset manifest')
  return data
}

/**
 * Path names already available offline. Three caches matter: the runtime asset
 * cache filled as tools are opened, Workbox's precache (the app shell) and the
 * un-hashed static cache (the zxing WASM and the Noto font, which the manifest
 * also lists). Counting only the first would report the shell as missing and
 * make "download all" re-fetch files the browser already has.
 *
 * Cache keys are absolute URLs, so they are reduced to path names to compare
 * against the manifest.
 */
export async function cachedUrlSet(cacheName: string = ASSET_CACHE): Promise<Set<string>> {
  if (typeof caches === 'undefined') return new Set()
  const names = (await caches.keys()).filter(
    (name) => name === cacheName || name === STATIC_CACHE || name.includes('precache'),
  )
  const paths = new Set<string>()
  for (const name of names) {
    const cache = await caches.open(name)
    for (const request of await cache.keys()) {
      paths.add(new URL(request.url).pathname)
    }
  }
  return paths
}

/** Pure: how much of the manifest is already cached, and what is left. */
export function computeStatus(
  manifest: OfflineManifest,
  cached: ReadonlySet<string>,
): OfflineStatus {
  let cachedCount = 0
  let cachedBytes = 0
  let totalBytes = 0
  const missing: PrefetchItem[] = []

  for (const file of manifest.files) {
    totalBytes += file.size
    if (cached.has(file.url)) {
      cachedCount++
      cachedBytes += file.size
    } else {
      missing.push(file)
    }
  }

  return {
    cachedCount,
    totalCount: manifest.files.length,
    cachedBytes,
    totalBytes,
    missing,
  }
}

/**
 * Resolves once a service worker controls this page, so a fetch started right
 * after actually goes through the worker and lands in the cache. Gives up
 * after `timeoutMs` — the download still works, it just would not be cached.
 */
export async function waitForController(timeoutMs = 3000): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  await navigator.serviceWorker.ready
  if (navigator.serviceWorker.controller) return true
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange)
      resolve(false)
    }, timeoutMs)
    function onChange() {
      clearTimeout(timer)
      navigator.serviceWorker.removeEventListener('controllerchange', onChange)
      resolve(true)
    }
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
  })
}
