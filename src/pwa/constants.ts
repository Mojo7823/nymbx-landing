/**
 * Cache names and URLs shared by the service-worker config in `vite.config.ts`
 * and the app code that reads Cache Storage (the dashboard's offline panel).
 *
 * Keep this file free of DOM/browser APIs: it is compiled both into the app
 * bundle and into the Vite config (Node), so it is listed in
 * `tsconfig.node.json` as well as `tsconfig.app.json`.
 */

/** Hashed build output under /assets — CacheFirst, filled as tools are opened. */
export const ASSET_CACHE = 'nymbx-assets'
/** Version catalogs that must revalidate (offline-assets.json, model/OCR manifests). */
export const CATALOG_CACHE = 'nymbx-catalogs'
/** Background-removal model shards (content-hashed, immutable). */
export const MODEL_CACHE = 'nymbx-models'
/** tesseract.js engine + tessdata language packs (version-stamped, immutable). */
export const OCR_CACHE = 'nymbx-ocr'
/** Un-hashed static assets: zxing WASM, the Noto font. */
export const STATIC_CACHE = 'nymbx-static'

/** Build-time manifest of every cacheable asset, emitted by scripts/offlineAssets.ts. */
export const OFFLINE_ASSETS_URL = '/offline-assets.json'
