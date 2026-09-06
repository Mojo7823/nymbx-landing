/**
 * Build-time companion to the service worker.
 *
 * Two jobs, both derived from the rollup/rolldown bundle:
 *
 * 1. `shellFiles` — the app shell: the entry chunks, the `/tools` route chunk
 *    and everything they statically import, plus all CSS and web fonts. The
 *    PWA plugin's `manifestTransforms` keeps only these, so a visitor who only
 *    ever opens the landing page does not precache 36 MB of tool chunks.
 * 2. `offline-assets.json` — the full list of cacheable assets with exact byte
 *    sizes, used by the dashboard's "download all tools" action (it feeds
 *    `prefetchUrls`, which verifies the byte length of every response).
 *
 * Sizes are read from the written files rather than from the in-memory bundle
 * so they always match what the server sends.
 */
import { statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/** Structural subset of a rollup/rolldown bundle entry — avoids depending on the bundler's types. */
export interface BundleEntryLike {
  type: 'chunk' | 'asset'
  fileName: string
  isEntry?: boolean
  facadeModuleId?: string | null
  imports?: readonly string[]
}

export interface OfflineAssetFile {
  url: string
  size: number
}

/** Module id suffix of the chunk that owns everything under /tools. */
const TOOLBOX_ROUTE_SUFFIX = 'src/pages/ToolboxRoutes.tsx'

const SHELL_ASSET_RE = /\.(?:css|woff2)$/
const OFFLINE_ASSET_RE = /^assets\/.+\.(?:js|mjs|css|wasm|woff2)$/

/**
 * File names (relative to `dist`) that make up the app shell: entry chunks and
 * the toolbox route chunk, walked transitively over static imports, plus every
 * stylesheet and font.
 */
export function collectShellFiles(bundle: Record<string, BundleEntryLike>): string[] {
  const roots: string[] = []
  const shell = new Set<string>()

  for (const entry of Object.values(bundle)) {
    if (entry.type !== 'chunk') {
      if (SHELL_ASSET_RE.test(entry.fileName)) shell.add(entry.fileName)
      continue
    }
    if (entry.isEntry || (entry.facadeModuleId ?? '').endsWith(TOOLBOX_ROUTE_SUFFIX)) {
      roots.push(entry.fileName)
    }
    // CSS can also be emitted as a chunk-adjacent asset; catch both shapes.
    if (SHELL_ASSET_RE.test(entry.fileName)) shell.add(entry.fileName)
  }

  const queue = [...roots]
  while (queue.length > 0) {
    const fileName = queue.pop()!
    if (shell.has(fileName)) continue
    shell.add(fileName)
    const entry = bundle[fileName]
    if (entry?.type === 'chunk') queue.push(...(entry.imports ?? []))
  }

  return [...shell].sort()
}

/** Every hashed build asset worth caching for offline use, in stable order. */
export function collectOfflineAssets(
  bundle: Record<string, BundleEntryLike>,
  extras: readonly string[],
): string[] {
  const files = Object.values(bundle)
    .map((entry) => entry.fileName)
    .filter((fileName) => OFFLINE_ASSET_RE.test(fileName))
    .sort()
  return [...files, ...extras]
}

/**
 * Populated in `generateBundle` and read by the PWA plugin's
 * `manifestTransforms` (which runs later, in `closeBundle`, in this process).
 */
export const shellFiles = new Set<string>()

/** Un-hashed files in `public/` that tools fetch at runtime. Skipped when absent. */
const PUBLIC_EXTRAS = ['zxing/zxing_reader.wasm', 'fonts/NotoSansTC-Regular.ttf']

export function offlineAssetsPlugin(): Plugin {
  let assetList: string[] = []

  return {
    name: 'nymbx-offline-assets',
    apply: 'build',
    generateBundle(_options, bundle) {
      shellFiles.clear()
      for (const fileName of collectShellFiles(bundle as Record<string, BundleEntryLike>)) {
        shellFiles.add(fileName)
      }
      assetList = collectOfflineAssets(bundle as Record<string, BundleEntryLike>, PUBLIC_EXTRAS)
    },
    writeBundle(options) {
      const dir = options.dir
      if (!dir) return
      const files: OfflineAssetFile[] = []
      for (const relative of assetList) {
        let size: number
        try {
          size = statSync(join(dir, relative)).size
        } catch {
          continue // public/ extra not present in this checkout
        }
        files.push({ url: `/${relative}`, size })
      }
      const total = files.reduce((sum, file) => sum + file.size, 0)
      const payload = { version: Date.now().toString(36), total, files }
      writeFileSync(join(dir, 'offline-assets.json'), JSON.stringify(payload))
      this.info(
        `offline-assets.json: ${files.length} files, ${total} bytes; shell: ${shellFiles.size} files`,
      )
    },
  }
}
