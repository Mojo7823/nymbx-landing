# Phase 61 — Polish & PWA (site-wide final pass)

Self-contained brief for the delegated agents. Read this fully before touching code. Rules in `CLAUDE.md` apply (lint + typecheck gate, privacy invariant, lazy-load heavy deps, DOMPurify, ToolLayout/FileDropzone reuse, never touch user files). **Do not commit and do not edit `PLAN.md`** — the orchestrator does both.

The phase is split into three T1 work packages (A, B, C) that run **sequentially** (they touch overlapping files). Each package ends with `npm run lint`, `npm run typecheck`, `npm run test` and `npm run build` green. The invocation tells you which package you own.

## 1. Goal

Close the roadmap with a site-wide polish pass over the 54 built tools and the dashboard:

- **A — PWA & offline, meta/OG, icons:** installable app; the dashboard shell works offline after the first visit; every tool that has been opened once keeps working offline; an opt-in "download all tools" action; long-lived caching for the background-removal model shards and the OCR language packs; friendly failure when a tool chunk is not cached; favicon/apple/PWA icons; Open Graph + Twitter meta; `theme-color`.
- **B — Dashboard search/filter, keyboard shortcuts, contrast debt:** ranked search over name/keywords/description with category filter chips and URL sync; global shortcuts with a help dialog; theme tokens fixed to WCAG AA (the debt logged in PLAN.md Phase 61).
- **C — Cross-browser harness (Playwright projects), fixes, perf:** `@playwright/test` with Chromium / Firefox / WebKit / mobile-WebKit projects and a smoke spec that opens every tool; fix what it finds; keep Lighthouse ≥ 90 (performance + accessibility) on the dashboard and the two heaviest tools.

Verification (T2/T3, by the verifier) covers everything: the site-wide screenshot sweep of all tool pages at 1280/390 × light/dark, the offline scenario, the e2e runs and Lighthouse.

## 2. What exists today (read these first)

- `vite.config.ts` — `react()`, `tailwindcss()`, `worker: { format: 'es' }`, COOP/COEP headers on dev + preview, `/api/convert` proxy. Config type comes from `vitest/config`, so **vitest loads the same plugin list**.
- `index.html` — SVG favicon (`/nymbx-icon-blue.svg`), description meta, inline pre-paint theme script reading `localStorage['nymbx:theme']`. No OG/Twitter meta, no `theme-color`, no manifest.
- `src/App.tsx` — routes: `/` Landing (static import), `/itsme` (lazy), `/tools/*` → `src/pages/ToolboxRoutes.tsx` (lazy; renders `Shell` = `Header` + `Sidebar` + `Outlet` + `Footer`; index = `Dashboard`, `:slug` = `ToolPage`). `<Toaster />` is mounted here.
- `src/pages/Dashboard.tsx` — hero, one `<input id="tool-search" type="search">`, sections per category, `matches()` = substring on name/description/slug. Sidebar links to `/tools#<category>` and the page scrolls on hash change.
- `src/pages/ToolPage.tsx` — `getTool(slug)` → `<Suspense>` around the lazy component from `src/tools/routes.ts` (`toolComponents`).
- `src/tools/registry.ts` — `ToolMeta { slug, name, description, category, badge, status, phase, icon }`, `categories` (7), `tools` (54 entries, all `available`), `getTool`, `toolsByCategory`. `src/lib/registry.test.ts` asserts 54 tools / 7 categories / phase coverage / the one server-assisted tool.
- `src/components/` — `Header` (menu button, logo, "Portfolio" link, `ThemeToggle`), `Sidebar`, `Footer`, `Button` (`primary: bg-pine text-page`, `secondary`, `ghost`), `ToolCard` (`bg-mint text-pine` icon tile, `PrivacyBadge`), `PrivacyBadge` (`bg-mint text-pine` / `bg-amber-soft text-amber-badge`), `Toast` (message + dismiss only, `toast()` in `src/lib/toast.ts`), `ProgressBar`, `ToolLayout` (sets `document.title`).
- `src/lib/theme.ts` — `getTheme()` / `applyTheme()` (toggles `html.dark`, mirrors to `localStorage['nymbx:theme']` and IndexedDB). `ThemeToggle` keeps its own `useState(getTheme)` — a shortcut that toggles the theme must update the button too. `src/lib/useIsDark.ts` observes the class with a MutationObserver.
- `src/lib/prefetch.ts` — `prefetchUrls(items: {url,size}[], onProgress, signal, opts)` streams large immutable files with byte progress, stall watchdog and retries; throws `PrefetchCancelled` / `PrefetchError`. Reuse it for the "download all tools" action.
- `src/index.css` — semantic tokens in `:root` and `.dark` (`--c-pine`, `--c-mint`, `--c-amber`, `--c-faint`, …) mapped through `@theme inline` to Tailwind utilities (`text-pine`, `bg-mint`, `text-amber-badge`, `text-faint`, …). Components never use raw hex.
- `deploy/Caddyfile` — COOP/COEP/nosniff on every response; `/assets/*` immutable; `/models/*` and `/ocr/{engine,lang}/*` immutable except their catalogs (`resources.json`, `.version`, `manifest.json` → `no-cache`); `/api/convert/*` → Gotenberg; SPA fallback `try_files {path} /index.html`.
- Static assets in `public/` (all self-hosted, nothing cross-origin): `models/` (212 MB background-removal shards, content-hashed names + `resources.json` + `.version`), `ocr/engine/<ver>/`, `ocr/lang/<ver>/*.traineddata.gz` (31 MB), `zxing/zxing_reader.wasm` (1.1 MB, un-hashed URL), `fonts/NotoSansTC-Regular.ttf` (7.1 MB, un-hashed, used by PDF watermark and PDF sign), `itsme/` (52 MB of personal-page video — **never cache**), the two gecko SVGs.
- Production bundle (`npm run build`): `dist/assets/` = 607 files, 36 MB (25.8 MB JS, 8.5 MB WASM, 131 kB woff2, 89 kB CSS). Entry `assets/index-*.js` = 265,995 B (guarded number — the dashboard must not get heavier; see §4.1 on how to register the SW without touching it). `index.html` preloads `index-*.js`, `rolldown-runtime-*.js`, `jsx-runtime-*.js`, `index-*.css`. Route chunks: `ToolboxRoutes-*.js` (42 kB), `ItsMe-*.js/.css`, one chunk per tool (largest `PasswordStrength-*.js` 1.67 MB / 854 kB gz — the zxcvbn dictionaries), workers `*.worker-*.js`, shared `chunk-*.js` (biggest 663 kB and 209 kB).
- Playwright for T2/T3 is the **Python** package (1.62) with Chromium 1234 at `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`; see memory note "Visual check setup". Firefox 1538 and WebKit 2336 are now downloaded too (§3.4).

## 3. Sources of truth (verified 2026-09-06)

### 3.1 vite-plugin-pwa 1.3.0 (context7 `/vite-pwa/docs`; `npm view`)

- Peer deps: `vite ^3.1 … ^8.0` (Vite 8 OK), `workbox-build ^7.4.1`, `workbox-window ^7.4.1` (both must be installed explicitly: `npm i -D vite-plugin-pwa@1.3.0 workbox-build@7.4.1 workbox-window@7.4.1`). `@vite-pwa/assets-generator` is optional — not needed, icons are pre-generated (§3.5).
- Plugin options used: `registerType: 'prompt'`, `injectRegister: null` (we register manually), `includeAssets`, `manifest`, `workbox` (passed straight to workbox-build `generateSW`), `devOptions: { enabled: false }` (no SW in `vite dev`), `disable`.
- `workbox` (generateSW) options: `globPatterns` (relative to `dist`), `globIgnores`, `maximumFileSizeToCacheInBytes` (default 2 MiB — larger files are **skipped with a warning** at glob time), `manifestTransforms: [(entries) => ({ manifest, warnings })]` (entries are `{ url, revision, size }`; `url` is relative like `assets/index-abc.js` — log once to confirm the shape and normalise), `navigateFallback` (plugin default = `index.html`), `navigateFallbackDenylist: RegExp[]`, `cleanupOutdatedCaches`, `clientsClaim` (default true), `skipWaiting` (leave false for prompt mode), `runtimeCaching[]`.
- `runtimeCaching` entry: `{ urlPattern: RegExp | string | ({ url, request, sameOrigin }) => boolean, handler: 'CacheFirst' | 'NetworkFirst' | 'StaleWhileRevalidate' | 'NetworkOnly', options: { cacheName, expiration: { maxEntries, maxAgeSeconds, purgeOnQuotaError }, cacheableResponse: { statuses }, networkTimeoutSeconds } }`. Routes are matched **in array order**, first match wins. Function `urlPattern`s are serialised into `sw.js`: they must be self-contained (no closure variables). Without a `cacheableResponse` plugin only status 200 is cached.
- Registration API (`virtual:pwa-register`): `registerSW({ immediate, onNeedRefresh, onOfflineReady, onRegisteredSW(url, registration), onRegisterError }) → (reloadPage?: boolean) => Promise<void>`. Types: add `/// <reference types="vite-plugin-pwa/client" />` (create `src/vite-env.d.ts`) — do not add the types to `tsconfig.node.json`.
- Precache responses are stored with their headers, so the shell served offline keeps `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` and `crossOriginIsolated` stays `true` (verify in T3).

### 3.2 Contrast targets (computed with `polish-assets/contrast.py`, WCAG 2.1 relative luminance)

Current light theme fails AA (4.5:1) in 10 pairs; dark fails in 3. Decision: **change token values only** — no component churn (39 `bg-mint text-pine` chips, 103 `text-pine`, 171 `text-faint` uses stay as they are).

| token | light today | light new | ratio new (worst pair) | dark today | dark new |
|---|---|---|---|---|---|
| `--c-pine` | `#33a06f` (2.97 on mint, 3.28 white-on) | `#247a55` | 4.76 on mint, 5.26 on white | `#42b883` (5.28) | unchanged |
| `--c-pine-deep` | `#2e8f63` (4.02 white-on) | `#1d6a4b` | 6.53 | `#5fcb98` | unchanged |
| `--c-amber` | `#a8641c` (4.17 on amber-soft) | `#8c5214` | 5.63 on amber-soft | `#dba15e` (6.67) | unchanged |
| `--c-muted` | `#67676c` (5.62) | `#626267` | 6.07 (keeps distance from faint) | `#98989f` (5.12 on soft) | `#a3a3aa` (5.85 on soft) |
| `--c-faint` | `#98989f` (2.87 on white) | `#70707a` | 4.53 on soft, 4.90 on white | `#6a6a71` (2.73 on soft) | `#8e8e97` (4.52 on soft) |

`--c-spring` (`::selection` only) and the landing `--c-brand-*` tokens are untouched. `polish-assets/contrast.py` must print `all pairs >= 4.5:1` after the change.

### 3.3 Lighthouse

`npx --yes lighthouse@13` is warm in the npx cache. Run with Playwright's Chromium:

```
CHROME_PATH=~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
npx --yes lighthouse http://127.0.0.1:4173/tools --preset=desktop \
  --only-categories=performance,accessibility,best-practices \
  --chrome-flags="--headless=new --no-sandbox" --output=json --output-path=<file> --quiet
```

Run each URL twice (desktop preset and the mobile default) and report both; the ≥ 90 gate applies to the desktop run for performance and to both runs for accessibility. Lighthouse 12+ has no PWA category — installability is checked in T3 instead (manifest + SW + icons).

### 3.4 Playwright (Node) for the cross-browser projects

`@playwright/test@1.62.1` uses **the same browser revisions as the Python install** (chromium-1234, firefox-1538, webkit-2336), so `npx playwright install` downloads nothing new. Firefox launches. WebKit's `MiniBrowser` needs nine host libraries that are not installed and `sudo` is not available to agents; the orchestrator downloaded the `.deb`s with `apt-get download` (`libevent-2.1-7t64 libflite1 libavif16 libmanette-0.2-0 libbacktrace0 libdav1d7 libgav1-2 libyuv0 libhidapi-hidraw0`) and copied the extracted `.so` files into `~/.cache/ms-playwright/webkit-2336/minibrowser-wpe/sys/lib/`, which the bundled launcher already puts on `LD_LIBRARY_PATH`. Playwright's own host check still fails, so WebKit must be run with

```
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npx playwright test --project=webkit --project=mobile-webkit
```

(verified: WebKit 26.5 launches and renders). Put that variable into the `e2e` npm script or document it in `playwright.config.ts`. If WebKit cannot launch anyway, run the other projects and report WebKit as blocked — do not remove the project from the config.

### 3.5 Pre-generated assets — `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/polish-assets/`

Made by `make-icons.py` (Chromium rasterises the gecko SVGs; Pillow packs the ICO). Copy into `public/` with these names:

| file | content |
|---|---|
| `pwa-192.png`, `pwa-512.png` | green toolbox gecko, transparent background, purpose `any` |
| `pwa-maskable-512.png` | green gecko at 62 % on white — safe zone for `purpose: maskable` |
| `apple-touch-icon.png` | 180×180, green gecko on white |
| `favicon.ico` | 16/32/48 blue gecko (site identity, matches the SVG favicon) |
| `og-image.png` | 1200×630, blue gecko + "NYMBX" + tagline + nymbx.dev |
| `contrast.py` | token contrast checker (§3.2) |

## 4. Behaviour specification

### 4.1 Part A — PWA, offline, meta

**Service worker (generateSW, prompt mode).**

- Precache = the **app shell only**: `index.html`, the entry chunk and its transitive static imports, the `ToolboxRoutes-*.js` chunk and its transitive static imports, every `assets/*.css`, every `assets/*.woff2`, the manifest and the icons from `includeAssets`. Target ≈ 1 MB. Not the 36 MB of tool chunks — a landing-page visitor must not download the whole toolbox in the background.
- The shell set is computed at build time by a small Vite plugin `scripts/offlineAssets.ts` (§5): in `generateBundle` walk the bundle from `isEntry` chunks and the chunk whose `facadeModuleId` ends with `src/pages/ToolboxRoutes.tsx`, following `chunk.imports` transitively; collect their file names plus all `.css`/`.woff2` assets. It exposes the set through an exported module-level `Set` that the PWA `manifestTransforms` callback reads (both run in the same process; our `generateBundle` runs before the PWA plugin's `closeBundle`). `globPatterns: ['index.html', 'assets/**/*.{js,mjs,css,woff2}']`, `maximumFileSizeToCacheInBytes: 4 * 1024 * 1024` (avoids skip warnings; the transform drops everything outside the shell anyway).
- The same plugin emits `offline-assets.json` (`{ version, total, files: [{ url, size }] }`) listing **every** `assets/*.{js,mjs,css,wasm,woff2}` plus `zxing/zxing_reader.wasm` and `fonts/NotoSansTC-Regular.ttf` (sizes from `public/` via `statSync`; skip silently if absent). Models, OCR packs and `itsme/` are not in it.
- `runtimeCaching`, in this order (all same-origin; use the `({ url, sameOrigin }) => …` form or anchored RegExps on `url.pathname`):
  1. catalogs — `/offline-assets.json`, `/models/resources.json`, `/models/.version`, `/ocr/engine/manifest.json`, `/ocr/engine/.version` → `NetworkFirst`, `cacheName: 'nymbx-catalogs'`, `networkTimeoutSeconds: 5`.
  2. `/assets/**.{js,mjs,css,wasm,woff2}` → `CacheFirst`, `cacheName: 'nymbx-assets'`, `expiration: { maxEntries: 1500, maxAgeSeconds: 90 days, purgeOnQuotaError: true }`.
  3. `/models/**` → `CacheFirst`, `'nymbx-models'`, 365 days, `maxEntries: 200`, `purgeOnQuotaError`.
  4. `/ocr/engine/**`, `/ocr/lang/**` → `CacheFirst`, `'nymbx-ocr'`, 365 days.
  5. `/zxing/**`, `/fonts/**` → `StaleWhileRevalidate`, `'nymbx-static'` (un-hashed URLs; refreshed in the background after a deploy).
  Nothing else is handled: `/api/**` and `/itsme/**` go to the network. `navigateFallbackDenylist: [/^\/api\//]`. `cleanupOutdatedCaches: true`.
- Cache names live in `src/pwa/constants.ts` (`ASSET_CACHE`, `OFFLINE_ASSETS_URL`, …) and are imported by both the app and `vite.config.ts` (add the file to `tsconfig.node.json` `include`).
- `disable: process.env.VITEST === 'true'` so unit tests never load the plugin. Unit tests must not import `virtual:pwa-register`; the registration module is only reached through a dynamic import guarded by `import.meta.env.PROD` (below).

**Registration (`src/pwa/register.ts`, loaded lazily).** `App.tsx` registers after the `load` event via `import('./pwa/register')` — only when `import.meta.env.PROD && 'serviceWorker' in navigator`. This keeps `workbox-window` out of the entry chunk (the 265,995 B number must not change) and defers SW work until the page is interactive. `registerPwa()` calls `registerSW({ immediate: true, onNeedRefresh, onOfflineReady, onRegisteredSW })`:

- `onNeedRefresh` → persistent toast "A new version is ready." with a **Reload** action that calls `updateSW(true)`.
- `onOfflineReady` → success toast "NYMBX Toolbox is ready to work offline."
- `onRegisteredSW(_, registration)` → `registration.update()` every 60 minutes and whenever the tab becomes visible again.

**Toast action.** Extend `src/lib/toast.ts` / `Toast.tsx`: `toast(message, { action?: { label: string; onClick: () => void } })`; the action renders as a small secondary `Button` inside the toast; clicking it runs `onClick` and dismisses the toast. Existing tests must keep passing; add one for the action.

**Chunk-load failure boundary.** New `src/components/ChunkErrorBoundary.tsx` (class component, `componentDidCatch`): wraps the `<Suspense>` in `ToolPage.tsx` and the two lazy routes in `App.tsx`. On error it renders a card inside the normal page frame: when `!navigator.onLine` → "This tool hasn't been downloaded yet. Connect to the internet and try again." otherwise "This page failed to load." Both with a **Retry** button (`location.reload()`) and a link back to `/tools`. Never a blank screen. Unit test with a lazy component that rejects.

**Offline indicator.** `src/lib/useOnline.ts` (`navigator.onLine` + `online`/`offline` events via `useSyncExternalStore`). `Header` shows a small `WifiOff` chip "Offline" (bg-amber-soft text-amber-badge, `role="status"`) while offline. The DOCX ↔ PDF page (`src/tools/docx-pdf/DocxPdf.tsx`) shows its existing server notice plus "You're offline — this server-assisted tool needs a connection." and disables its convert button while offline.

**"Use offline" panel on the dashboard.** New `src/pwa/OfflinePanel.tsx`, rendered at the bottom of `Dashboard.tsx` (after the category sections; hidden while a search query is active). Hidden entirely when `!('serviceWorker' in navigator)` or `navigator.serviceWorker.getRegistration()` resolves to nothing (so it never shows in `vite dev`). Content:

- One line of copy: "Tools you open are kept for offline use automatically. The background-removal model and the OCR language packs are downloaded the first time you use those tools and kept too."
- Status computed from `caches.open(ASSET_CACHE).keys()` against `offline-assets.json`: "N of M tool files cached (X MB of Y MB)"; when complete: "All tools are available offline." with a check icon.
- Button **Download all tools for offline use (Y MB)** → waits for `navigator.serviceWorker.ready` (and a `controllerchange` if there is no controller yet, 3 s cap), then `prefetchUrls(missingFiles, onProgress, signal)`; `ProgressBar` with bytes; **Cancel**; on success toast "All tools are available offline."; on `PrefetchError` show the message inline. Files already cached are skipped.
- No persistence; everything is derived from Cache Storage on mount.

**Manifest** (`manifest.webmanifest`, generated by the plugin): `name: 'NYMBX Toolbox'`, `short_name: 'NYMBX'`, `description: 'Private, in-browser tools — files never leave your device.'`, `id: '/tools'`, `start_url: '/tools'`, `scope: '/'`, `display: 'standalone'`, `background_color: '#ffffff'`, `theme_color: '#ffffff'`, `lang: 'en'`, `categories: ['utilities', 'productivity']`, icons `pwa-192.png` (192, any), `pwa-512.png` (512, any), `pwa-maskable-512.png` (512, maskable), and four `shortcuts` (`/tools/pdf-merge`, `/tools/image-compressor`, `/tools/bulk-file-hasher`, `/tools/diff-checker`, each with `pwa-192.png`). `includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'nymbx-icon.svg', 'nymbx-icon-blue.svg']`.

**`index.html`** additions: `<link rel="icon" href="/favicon.ico" sizes="48x48">` (keep the SVG link first), `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`, `<meta name="theme-color" content="#ffffff">` (updated at runtime, below), `<meta name="color-scheme" content="light dark">`, Open Graph (`og:type=website`, `og:site_name=NYMBX`, `og:title`, `og:description`, `og:url=https://nymbx.dev/`, `og:image=https://nymbx.dev/og-image.png`, `og:image:width/height`, `og:image:alt`), Twitter (`twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`), `<link rel="canonical" href="https://nymbx.dev/">`. The plugin injects the manifest link itself. Titles are still set per route in JS (`ToolLayout`, `Dashboard`, `Landing`).

**`theme-color` at runtime:** `applyTheme()` sets the meta to `#ffffff` (light) / `#1b1b1f` (dark); the inline pre-paint script in `index.html` does the same for dark.

**Caddy:** add `@nocache path /sw.js /manifest.webmanifest /offline-assets.json /index.html` → `Cache-Control "no-cache"` inside `handle`. `workbox-*.js` is hashed; leave it to heuristics. Keep every existing rule.

### 4.2 Part B — Search, shortcuts, contrast

**Registry keywords.** `ToolMeta.keywords: string[]` (required, lowercase, 2–6 per tool, no duplicates of the name words): synonyms, file extensions, algorithms, formats — e.g. `bulk-file-hasher: ['checksum', 'sha256', 'md5', 'sha1', 'blake2', 'manifest']`, `xlsx-csv-viewer: ['excel', 'spreadsheet', 'xlsx', 'csv', 'export']`, `em-dash-remover: ['dash', 'punctuation', 'ai text', 'cleanup']`, `docx-pdf: ['word', 'docx', 'convert', 'libreoffice']`. Add a registry test: every tool has ≥ 2 lowercase keywords, none equal to another tool's slug.

**Search (`src/lib/toolSearch.ts`, pure, unit-tested).** `searchTools(tools, query): ToolMeta[]`. Tokenise the query on whitespace; every token must match somewhere (AND). Score per tool = sum of the best match per token: name exact 100, name prefix 80, name word prefix 60, keyword exact 50, keyword prefix 40, category name includes 30, description includes 20, slug includes 15. Sort by score desc, then registry order. Empty query → registry order. Tests: `"hash"` ranks Bulk file hasher and Text hasher first; `"excel"` finds the XLSX viewer through a keyword; `"pdf merge"` (two tokens) returns PDF merge first; unknown token → empty.

**Dashboard.**

- Query and category live in the URL: `?q=` and `?category=` via `useSearchParams` with `{ replace: true }` (typing must not spam history). Deep links work on load.
- Category filter chips under the search box: **All** + one per category (`aria-pressed`, `bg-mint text-pine` when active, pill style). Chips filter both the section view and search results.
- No query → category sections as today (filtered by the active chip). With a query → a single ranked grid under the heading "N tools match “query”" (`aria-live="polite"` count). Zero → the existing empty state.
- Input: clear button (`X`, `aria-label="Clear search"`), `Esc` clears (then blurs if already empty), `Enter` opens the top result, `ArrowDown` moves focus to the first result card; on cards `ArrowDown`/`ArrowUp` move between cards (`data-tool-card`), `ArrowUp` from the first card returns to the input. A `<kbd>` hint at the right of the input shows `⌘K` on Apple platforms and `Ctrl K` elsewhere (hidden below `sm`).
- When navigated to with `location.state?.focusSearch`, focus the input on mount (used by the global shortcut from tool pages).
- The `OfflinePanel` from Part A stays at the bottom and is hidden while a query is active.

**Global shortcuts** (`src/lib/shortcuts.ts` + `useGlobalShortcuts()` in `Shell`; ignored when the event target is editable — `input`, `textarea`, `select`, `[contenteditable]` — or a `<dialog>` is open, except `Esc`):

| keys | action |
|---|---|
| `Ctrl/⌘ + K`, `/` | focus the dashboard search (navigate to `/tools` with `state: { focusSearch: true }` when not on the dashboard) |
| `?` (Shift + /) | open the shortcuts dialog |
| `Shift + D` | toggle dark mode |
| `Esc` | clear/blur the search, close the dialog |
| `↑ ↓ Enter` | move through / open search results (Dashboard-local, above) |

`ShortcutsDialog.tsx`: native `<dialog>` opened with `showModal()`, `aria-labelledby`, table of the shortcuts with `<kbd>`, close button, closes on `Esc`/backdrop click; the header gets a `Keyboard` icon button ("Keyboard shortcuts", `sm:` and up) that opens it. The dialog is site-toolbox-wide (mounted in `Shell`).

**Theme store.** `src/lib/theme.ts` becomes a tiny external store: `subscribeTheme`, `useTheme()` (`useSyncExternalStore`), `toggleTheme()`; `applyTheme` notifies. `ThemeToggle` and the shortcut both use it so the button icon always matches. Keep `useIsDark` working (or reimplement it on the store) — it is used by several tools.

**Contrast tokens.** Apply the §3.2 values in `src/index.css`. Run `python3 …/polish-assets/contrast.py` → must exit 0. Check the dark tokens too. Also make the primary `Button` focus ring visible on both themes (`focus-visible:outline` uses `--c-pine`; verify it is not lost against `bg-pine`: add `focus-visible:outline-offset-2` and a `ring`/outline colour that contrasts, e.g. `outline-ink` on primary). Screenshot the dashboard + one tool in both themes before/after and eyeball that the new greens still read as the same brand.

### 4.3 Part C — Cross-browser harness, fixes, performance

**Harness.** `npm i -D @playwright/test@1.62.1`. Files: `playwright.config.ts` (root), `tsconfig.e2e.json` (extends nothing; `lib: ["ES2023", "DOM", "DOM.Iterable"]`, `module: ESNext`, `moduleResolution: bundler`, `strict`, `noEmit`, `types: ["node"]`, `include: ["e2e", "playwright.config.ts"]`; referenced from `tsconfig.json` so `tsc -b` type-checks it), `e2e/smoke.spec.ts`, `e2e/pwa.spec.ts`. `package.json`: `"e2e": "playwright test"`. `.gitignore`: `test-results`, `playwright-report`. Config: `testDir: 'e2e'`, `fullyParallel: true`, `retries: 0`, `reporter: 'list'`, `use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' }`, `webServer: { command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1', url: 'http://127.0.0.1:4173/tools', reuseExistingServer: true, timeout: 60_000 }` (the preview serves the existing `dist`; run `npm run build` first — say so in a comment), projects `chromium` (Desktop Chrome), `firefox` (Desktop Firefox), `webkit` (Desktop Safari), `mobile-webkit` (`iPhone 13`, 390 px). ESLint already lints `e2e/**/*.ts` (flat config covers all `.ts`); Prettier too.

**`smoke.spec.ts`** (all projects):

1. `/tools` renders ≥ 50 `[data-tool-card]` links; the search input has the platform hint; typing `hash` shows "N tools match" with Bulk file hasher first; `?q=excel` deep link lists the XLSX viewer; a category chip narrows the sections; `Ctrl+K` focuses the input from `/tools/diff-checker`; `?` opens the dialog and `Esc` closes it; `Shift+D` toggles `html.dark`.
2. Every tool route — collect the slugs from the dashboard card hrefs at test start — loads with `h1` = the card's name, no `pageerror`, no `console.error` (fail on any; if a browser emits a known-benign message, allowlist it by exact text with a comment), and `document.documentElement.scrollWidth <= window.innerWidth` (the mobile project is the overflow check). Use `test.describe.parallel` and a 15 s per-page timeout; WASM-heavy pages only need to render their empty state, not process files.

**`pwa.spec.ts`** (chromium only, `test.skip` elsewhere): `/manifest.webmanifest` is 200 with the three icons; after loading `/tools`, `navigator.serviceWorker.ready` resolves and `caches.keys()` contains a `workbox-precache` entry; open `/tools/diff-checker` once; `context.setOffline(true)`; reload `/tools` → cards render and `crossOriginIsolated === true`; go to `/tools/diff-checker` → renders; go to `/tools/pdf-merge` (never opened) → the ChunkErrorBoundary message is shown, not a blank page.

**Run and fix.** Run `chromium` and `firefox` (and `webkit` + `mobile-webkit` with the §3.4 environment). Fix real cross-browser defects in the tools (rendering, unsupported API without fallback, module-worker issues); allowlist nothing without a written reason. Report every failure you could not fix with browser, tool and message.

**Performance item (conditional).** The verifier runs Lighthouse; but the PasswordStrength chunk (854 kB gz, loaded on route) will very likely miss ≥ 90 on the mobile run. Pre-empt it: in `src/tools/password-strength/strength.ts` load the zxcvbn packages through a single `import()` that runs on the first keystroke (or on idle after mount), keep the page chunk small, show a "Loading dictionaries…" state, and keep `strength.test.ts` passing (export the factory as an async initialiser and await it in tests). Confirm with `npm run build` that `PasswordStrength-*.js` drops well under 100 kB and the dictionaries become their own chunks.

## 5. Code layout

```
scripts/offlineAssets.ts            Vite plugin: shell set + offline-assets.json (pure helper collectOfflineAssets(bundle, extras) unit-tested)
scripts/offlineAssets.test.ts       fake bundle → shell + file list
src/pwa/constants.ts                cache names, OFFLINE_ASSETS_URL (shared with vite.config.ts)
src/pwa/register.ts                 registerPwa(): registerSW + toasts + periodic update
src/pwa/OfflinePanel.tsx            dashboard panel (status, download all, cancel)
src/pwa/offlineStatus.ts            readOfflineManifest(), cachedFileSet(), computeStatus()  (pure parts unit-tested)
src/components/ChunkErrorBoundary.tsx
src/lib/useOnline.ts
src/lib/toolSearch.ts (+ .test.ts)
src/lib/shortcuts.ts (+ .test.ts for isEditableTarget / key matching)
src/components/ShortcutsDialog.tsx
src/vite-env.d.ts                   /// <reference types="vite-plugin-pwa/client" />
playwright.config.ts, tsconfig.e2e.json, e2e/smoke.spec.ts, e2e/pwa.spec.ts
public/{favicon.ico, apple-touch-icon.png, pwa-192.png, pwa-512.png, pwa-maskable-512.png, og-image.png}
```

Modified: `vite.config.ts`, `index.html`, `deploy/Caddyfile`, `tsconfig.json`, `tsconfig.node.json`, `package.json`, `.gitignore`, `src/App.tsx`, `src/pages/ToolboxRoutes.tsx`, `src/pages/Dashboard.tsx`, `src/pages/ToolPage.tsx`, `src/components/{Header,ThemeToggle,Toast}.tsx`, `src/lib/{toast,theme}.ts`, `src/tools/registry.ts`, `src/lib/registry.test.ts`, `src/index.css`, `src/tools/docx-pdf/DocxPdf.tsx`, `src/tools/password-strength/*` (Part C).

## 6. Tasks (T1 — per package, in order; lint + typecheck after each step, tests and build at the end)

**A1** install the three packages; `src/pwa/constants.ts`; `scripts/offlineAssets.ts` + test; `vite.config.ts` (plugin + VitePWA); `tsconfig.node.json` include; `src/vite-env.d.ts`. `npm run build` → confirm `dist/sw.js`, `dist/manifest.webmanifest`, `dist/offline-assets.json`; inspect the precache list inside `sw.js` (should be ~10–20 entries, no tool chunks) and the entry chunk size (unchanged).
**A2** icons + `index.html` meta + `theme-color` in `applyTheme` + Caddyfile.
**A3** toast action; `register.ts`; `App.tsx` lazy registration.
**A4** `ChunkErrorBoundary` + wiring + test; `useOnline` + Header chip + DocxPdf notice.
**A5** `offlineStatus.ts` + `OfflinePanel.tsx` + Dashboard placement; tests for the pure parts.
**A6** `npm run preview`, Python Playwright: SW registers, `caches.keys()`, offline reload of `/tools` works, chunk boundary shows for an unopened tool. Report precache entries, cache names, bundle sizes.

**B1** contrast tokens + `contrast.py` exit 0 + Button focus ring.
**B2** registry keywords + tests; `toolSearch.ts` + tests.
**B3** Dashboard: URL sync, chips, ranked results, keyboard handling, hint, focus-on-state.
**B4** theme store + `ThemeToggle`; `shortcuts.ts` + `useGlobalShortcuts` + `ShortcutsDialog` + Header button.
**B5** preview + Python Playwright pass over the new dashboard at 1280/390 × light/dark; keyboard flows.

**C1** harness files + `npm run e2e --project=chromium` green.
**C2** firefox, webkit, mobile-webkit runs; fix defects; report the matrix.
**C3** password-strength deferred dictionaries; bundle check.

Each package's report: files touched, package versions, gate output (files/tests counts), bundle numbers (`index-*.js`, precache entry count, `PasswordStrength-*.js`), decisions taken, anything deviating from this brief.

## 7. Verification (T2/T3, by the verifier — read-only; scripts in `…/scratchpad/polish-verify/`, re-runnable against `npm run build` + `npm run preview` on 127.0.0.1:4173)

1. **Gates:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` (record counts and sizes; entry chunk must still be 265,995 B or explain the delta).
2. **Site-wide sweep (`sweep.py`):** every tool slug (scrape the dashboard links) plus `/tools`, `/`, `/tools/nope` at 1280 and 390 × light and dark. Per page: console errors, `pageerror`, `requestfailed`, any request off 127.0.0.1:4173 or non-GET (privacy invariant), horizontal overflow, screenshot `shots/<slug>-<w>-<theme>.png`. Build contact sheets (Pillow, 12 thumbnails per sheet) for the orchestrator's review. Report a table with one line per failing page only.
3. **PWA (Chromium):** manifest served with icons; SW registered; precache contains only shell files; open two tools; `context.set_offline(True)`; `/tools` reloads and renders; opened tools work; an unopened tool shows the boundary message; `crossOriginIsolated` true offline; the "Download all tools" button downloads everything (assert the `nymbx-assets` cache holds every file from `offline-assets.json`) and after that **every** tool route renders offline (loop over all slugs offline). Note: Playwright's `page.on('request')` does not see SW-originated fetches — use `context.on('request')` and `context.service_workers`.
4. **Search + shortcuts:** the flows in §4.2/§4.3 by hand with Python Playwright, including screen-reader labels (`aria-pressed`, `aria-live`, dialog `aria-labelledby`).
5. **Contrast:** `contrast.py` exit 0; axe via Lighthouse accessibility audit shows no `color-contrast` failures on `/tools` and two tools.
6. **Lighthouse (§3.3):** `/tools`, `/tools/password-strength`, and the second-heaviest tool by bytes transferred on load (measure during the sweep with `performance.getEntriesByType('resource')`). Desktop and mobile runs; report the four scores per URL; performance ≥ 90 (desktop) and accessibility ≥ 90 (both) required.
7. **e2e:** `npm run e2e` per project; report pass/fail counts per browser (WebKit with the §3.4 environment).
8. **Docker:** not needed here (orchestrator does it).

## 8. Definition of done

- Gates green; entry chunk unchanged (or the delta explained and accepted by the orchestrator); precache ≈ 1 MB and no tool chunk in it.
- Offline: dashboard + opened tools work offline; unopened tools show the boundary message; "download all" makes every tool route render offline; `crossOriginIsolated` stays true.
- Dashboard search ranks by name/keywords, URL-synced, category chips, keyboard flows; shortcuts + dialog; theme toggle stays in sync.
- `contrast.py` passes; Lighthouse accessibility ≥ 90 and desktop performance ≥ 90 on the three URLs.
- e2e green on chromium and firefox (webkit/mobile-webkit green or documented as blocked by the host libraries).
- Sweep: zero console errors, zero overflow, zero off-origin requests across all pages × viewports × themes.
- Handout §9 notes and the PLAN.md Phase 61 line are written by the orchestrator.

## 9. Implementation notes (post-T1/T2/T3, 2026-09-06)

Shipped as three commits — part A (PWA/offline/meta), part B (search/shortcuts/contrast), part C (Playwright projects, password-strength chunk split) — plus a verification fix-up commit. Deviations from the brief, all accepted:

- **Precache accounting.** 51 entries ≈ 563 KiB (plugin figure) / 646 KB raw: `index.html`, entry chunk, `ToolboxRoutes-*.js`, 24 shared chunks, 5 CSS (incl. 4 small tool stylesheets — allowed by the `assets/*.css` rule), 6 woff2, manifest, icons. No tool JS, worker or WASM. `offline-assets.json` = **615** files / 42.0 MB (613 hashed assets + zxing WASM + Noto font); the implementer's 611 was stale.
- **`clientsClaim` is not a generateSW default** — without it the first visit is uncontrolled and nothing that page fetches is cached. Set explicitly; safe with `skipWaiting: false`.
- **`matchOptions: { ignoreVary: true }`** on the four immutable-content routes. Vite preview sends `Vary: Origin`, Caddy `Vary: Accept-Encoding`; a module-script request carries an `Origin` header that the "download all" `fetch()` does not, so warmed entries were never matched by the import that needed them (0/54 tools offline before the fix, 54/54 after).
- **Offline coverage counts three caches** (`nymbx-assets`, the Workbox precache, `nymbx-static`); counting only the asset cache reported the shell as missing.
- **Caddy:** `@nocache path /index.html` only matches a literal request; the SPA fallback rewrites after `header` runs. Added `@spa not path *.*` → `no-cache` for every extension-less route (verified in a Caddy container).
- **Entry chunk** 265,995 → 270,090 B (+4,095): `ChunkErrorBoundary` must sit in the entry to wrap the lazy routes (+2,978), theme store pulled in by the landing's `ThemeToggle` and Button focus classes (+232), minifier churn (~885). `workbox-window` is a separate lazy chunk (`register-*.js`).
- **Search input owns its value.** Driving the controlled input from `useSearchParams` dropped characters when keystrokes were < 20 ms apart (React Router wraps the navigation in a transition; a keystroke landing mid-transition rendered against stale state). Fix: local state, URL written from a 150 ms debounce.
- **Ctrl/⌘ K is allowed from editable targets** (bare `/`, `?`, Shift+D are not); CodeMirror's own `Mod-k` wins because the global listener checks `defaultPrevented`.
- **Keywords** came out at 5–6 per tool (brief said 2–6); the registry test enforces ≥ 2, lowercase, unique, and not another tool's slug.
- **e2e sweep is 6 fixed shards** (slugs are read at run time, Playwright cannot register tests asynchronously) and asserts a non-empty `[data-tool-title]` rather than equality with the card name (several card labels are deliberately shorter than the page title). `pwa.spec.ts` accepts either boundary wording because Chromium's offline emulation leaves `navigator.onLine === true` on a page loaded after `setOffline`.
- **WebKit on this host:** the missing MiniBrowser libraries were extracted from `.deb`s into `~/.cache/ms-playwright/webkit-2336/minibrowser-wpe/sys/lib/` (the bundled launcher hardcodes `LD_LIBRARY_PATH=lib:sys/lib`); Playwright's host check still fails, so the `e2e` script sets `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`. Firefox/WebKit offline emulation does not route SW navigations (WebKit throws "internal error"), hence the Chromium-only offline spec.
- **Verification fix-ups** (after the verifier's pass): debounced URL write (above); `inert` on the closed mobile drawer (axe `aria-hidden-focus`, ~4 points on every mobile a11y score); `FileDropzone` named by its content (an `aria-labelledby` pointing at the main label alone still tripped `label-content-name-mismatch`, because the hint and privacy note are visible text too) with the file inputs moved outside the `role="button"` wrapper and given `aria-label`s (axe `label`, `nested-interactive`); `aria-label` on the CodeMirror content in the markdown and mermaid editors (`aria-input-field-name`); tool-card links without `aria-label` (WCAG 2.5.3); `public/robots.txt` (Lighthouse SEO `robots-txt`).
- **Not verified:** the SW update toast (needs a second deploy — reviewed by code), real-device WebKit, the Gotenberg conversion path (no Gotenberg running).
- **T4 (fresh build, all fix-ups in):** `run_all.sh` all seven sections PASS; fast-typing probe 0/4 drops; Lighthouse accessibility 100 on `/tools`, password-strength, pdf-sign-annotate, markdown-editor and exif-viewer (desktop and mobile), SEO 100 with `robots.txt`; e2e 58 passed / 6 skipped. Note that `run_all.sh`'s Lighthouse step only covers the three gate URLs — the markdown-editor rows in its summary come from whichever earlier manual run left JSON in `lh/`, so re-run that page by hand when it matters.
- **Open items:** mobile Lighthouse performance below 90 on markdown-editor (64–74; 4.7 MB on load, CodeMirror + shiki), password-strength (~88) and pdf-sign-annotate (~89) — desktop is 97–100 everywhere; `nymbx-assets` `maxEntries: 1500` ≈ two deploys of assets before the LRU evicts part of a full offline download.
