import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { offlineAssetsPlugin, shellFiles } from './scripts/offlineAssets'
import {
  ASSET_CACHE,
  CATALOG_CACHE,
  MODEL_CACHE,
  OCR_CACHE,
  STATIC_CACHE,
} from './src/pwa/constants'

// Same headers Caddy sends in production — needed for crossOriginIsolated
// (multithreaded WASM, e.g. onnxruntime in the background remover).
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// Mirrors the Caddy handle_path /api/convert/* → Gotenberg proxy so the
// server-assisted DOCX → PDF tool works in dev/preview. Point GOTENBERG_URL
// at a real Gotenberg, or run `npm run gotenberg:mock` (soffice-backed).
const convertProxy = {
  '/api/convert': {
    target: process.env.GOTENBERG_URL ?? 'http://localhost:3100',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/convert/, ''),
  },
}

const DAY = 60 * 60 * 24

// These caches hold content-addressed (or version-stamped) files whose bytes do
// not depend on any request header, but the server answers with `Vary: Origin`
// (Vite preview) / `Vary: Accept-Encoding` (Caddy's `encode`). Cache Storage
// honours Vary by default, and a module-script request carries an `Origin`
// header that a plain `fetch()` for the same URL does not — so an entry warmed
// by the "download all tools" prefetch would never be found again by the
// import that needs it. Verified offline in Chromium.
const IGNORE_VARY = { ignoreVary: true }

// Phase 61 — installable PWA + offline shell.
//
// Precache is the app shell only (index.html, the entry chunk, the /tools
// route chunk, their static imports, CSS and fonts): a landing-page visitor
// must not pull 36 MB of tool chunks in the background. Everything else is
// cached on demand by the runtime routes below, so a tool works offline once
// it has been opened — or after the dashboard's "download all tools" action.
//
// The `urlPattern` callbacks are serialised into sw.js, so they must stay
// self-contained (no imports, no closure variables).
const pwaPlugin = VitePWA({
  registerType: 'prompt',
  injectRegister: null, // registered manually, lazily, from src/pwa/register.ts
  disable: process.env.VITEST === 'true',
  devOptions: { enabled: false },
  includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'nymbx-icon.svg', 'nymbx-icon-blue.svg'],
  manifest: {
    name: 'NYMBX Toolbox',
    short_name: 'NYMBX',
    description: 'Private, in-browser tools — files never leave your device.',
    id: '/tools',
    start_url: '/tools',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'en',
    categories: ['utilities', 'productivity'],
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'PDF merge',
        url: '/tools/pdf-merge',
        icons: [{ src: '/pwa-192.png', sizes: '192x192' }],
      },
      {
        name: 'Image compressor',
        url: '/tools/image-compressor',
        icons: [{ src: '/pwa-192.png', sizes: '192x192' }],
      },
      {
        name: 'Bulk file hasher',
        url: '/tools/bulk-file-hasher',
        icons: [{ src: '/pwa-192.png', sizes: '192x192' }],
      },
      {
        name: 'Diff checker',
        url: '/tools/diff-checker',
        icons: [{ src: '/pwa-192.png', sizes: '192x192' }],
      },
    ],
  },
  workbox: {
    // Glob wide, then drop everything that is not shell in manifestTransforms —
    // the shell set is only known once the bundle has been generated.
    globPatterns: ['index.html', 'assets/**/*.{js,mjs,css,woff2}'],
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    manifestTransforms: [
      (entries) => ({
        manifest: entries.filter(
          (entry) => !entry.url.startsWith('assets/') || shellFiles.has(entry.url),
        ),
        warnings: [],
      }),
    ],
    navigateFallbackDenylist: [/^\/api\//],
    cleanupOutdatedCaches: true,
    // prompt mode: the new worker waits until the user accepts the reload.
    skipWaiting: false,
    // The generated sw.js has no clientsClaim() unless it is asked for, which
    // leaves the *first* visit uncontrolled: everything that page fetches
    // bypasses the worker and is never cached. Claiming is safe next to
    // skipWaiting:false — an *update* still waits for the user's Reload.
    clientsClaim: true,
    runtimeCaching: [
      {
        // Version catalogs: always try the network so a deploy is picked up.
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin &&
          (url.pathname === '/offline-assets.json' ||
            url.pathname === '/models/resources.json' ||
            url.pathname === '/models/.version' ||
            url.pathname === '/ocr/engine/manifest.json' ||
            url.pathname === '/ocr/engine/.version'),
        handler: 'NetworkFirst',
        options: { cacheName: CATALOG_CACHE, networkTimeoutSeconds: 5 },
      },
      {
        // Hashed build output — immutable, so the cache is always right.
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin && /^\/assets\/.+\.(?:js|mjs|css|wasm|woff2)$/.test(url.pathname),
        handler: 'CacheFirst',
        options: {
          cacheName: ASSET_CACHE,
          matchOptions: IGNORE_VARY,
          expiration: { maxEntries: 1500, maxAgeSeconds: 90 * DAY, purgeOnQuotaError: true },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // Background-removal model shards (content-hashed names).
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin &&
          url.pathname.startsWith('/models/') &&
          url.pathname !== '/models/resources.json' &&
          url.pathname !== '/models/.version',
        handler: 'CacheFirst',
        options: {
          cacheName: MODEL_CACHE,
          matchOptions: IGNORE_VARY,
          expiration: { maxEntries: 200, maxAgeSeconds: 365 * DAY, purgeOnQuotaError: true },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // OCR engine + tessdata language packs (version-stamped directories).
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin &&
          (url.pathname.startsWith('/ocr/engine/') || url.pathname.startsWith('/ocr/lang/')) &&
          url.pathname !== '/ocr/engine/manifest.json' &&
          url.pathname !== '/ocr/engine/.version',
        handler: 'CacheFirst',
        options: {
          cacheName: OCR_CACHE,
          matchOptions: IGNORE_VARY,
          expiration: { maxEntries: 200, maxAgeSeconds: 365 * DAY, purgeOnQuotaError: true },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // Un-hashed URLs: serve from cache, refresh in the background so a
        // deploy that replaces them is picked up on the next visit.
        urlPattern: ({ url, sameOrigin }) =>
          sameOrigin && (url.pathname.startsWith('/zxing/') || url.pathname.startsWith('/fonts/')),
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: STATIC_CACHE,
          matchOptions: IGNORE_VARY,
          expiration: { maxEntries: 20, maxAgeSeconds: 365 * DAY, purgeOnQuotaError: true },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      // Everything else (/api/**, /itsme/**, …) is left to the network.
    ],
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), offlineAssetsPlugin(), pwaPlugin],
  // Module workers (`new Worker(url, { type: 'module' })`) — the only kind this
  // app creates. The default 'iife' worker format cannot code-split, which
  // would inline the SBOM viewer's ~690 KB of bundled JSON schemas into its
  // worker chunk; 'es' keeps each dynamic import a separate, cacheable chunk.
  worker: { format: 'es' },
  server: { headers: isolationHeaders, proxy: convertProxy },
  preview: { headers: isolationHeaders, proxy: convertProxy },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // `e2e/` holds Playwright specs (`npm run e2e`); Vitest must not collect
    // them — @playwright/test throws when its `test.describe` runs outside the
    // Playwright runner.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
