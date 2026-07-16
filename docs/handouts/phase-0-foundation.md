# Phase 0 Handout — Foundation

**Audience:** the agent implementing Phase 0. This document is self-contained; read it fully before writing code. The overall roadmap is in [/PLAN.md](../../PLAN.md) and the binding project rules are in [/CLAUDE.md](../../CLAUDE.md) — both are authoritative if anything here seems ambiguous.

---

## 1. What this project is

**NYMBX Toolbox** is a browser-based, all-in-one utility site. Its core promise — and the single most important constraint in the codebase — is:

> **User files never leave the device.** All processing happens client-side in the browser. The only exception is tools explicitly labeled "server-assisted" in the UI (currently exactly one: DOCX ↔ PDF conversion, built much later in Phase 15).

51 tools will be built across Phases 1–51, **one tool per phase**, after this foundation. Phase 0 builds **no tools** — it builds the shell everything else plugs into.

## 2. What Phase 0 delivers (scope)

1. **Project scaffold** — Vite + **React 19.2** + TypeScript (**strict mode**) + Tailwind CSS + React Router. Use the latest stable Vite and Node LTS.
2. **npm scripts** (exact names matter — every future phase's quality gate depends on them):
   - `dev`, `build`, `preview`
   - `lint` — ESLint + Prettier check, zero warnings tolerated
   - `typecheck` — `tsc --noEmit`
   - `test` — Vitest
3. **Dashboard home page** (`/`) — the first thing users see:
   - Grid of tool cards grouped by category (catalog in §5). Each card: icon, tool name, one-line description, and a badge — `client-side` (green style) or `server-assisted` (amber style).
   - Since no tools exist yet, **every card renders in a "coming soon" state**: visible but non-clickable, visually muted, clearly intentional (not broken-looking).
   - A client-side text filter/search box over the cards.
4. **App shell:**
   - Header: site name ("NYMBX Toolbox"), theme toggle (light/dark, persisted, no flash-of-wrong-theme on reload).
   - Category navigation (sidebar on desktop, collapsible on mobile).
   - Footer with the privacy statement: *"Your files never leave this device — all processing happens in your browser."*
   - 404 page for unknown routes.
5. **Shared components** in `src/components/` (future tools will consume these — design the APIs for reuse, add basic Vitest coverage):
   - `ToolLayout` — consistent tool-page frame: title, description, privacy badge (client-side / server-assisted), back-to-dashboard link. Takes children for the tool body.
   - `FileDropzone` — drag-and-drop + click-to-pick; props for `accept`, `multiple`, max size; shows file names/sizes once selected; keyboard accessible.
   - `Button`, `Toast` (imperative `toast()` helper), `ProgressBar` (determinate + indeterminate), `CopyButton` (copies text, flashes confirmation).
6. **Shared utilities** in `src/lib/` (with unit tests):
   - `downloadBlob(blob, filename)` — triggers a browser download.
   - `downloadZip(files: {name, data}[], zipName)` — builds a compressed zip via `fflate` and downloads it.
   - `formatBytes(n)` — human-readable sizes.
   - Worker helper — a thin Comlink wrapper so tools can run functions in a Web Worker with minimal boilerplate.
   - Settings store — small typed key-value store on IndexedDB via `idb` (used for theme, future tool preferences). **Never store user file content.**
7. **Deployment container** (target platform is **Zeabur**, which auto-detects a root Dockerfile):
   - Multi-stage `Dockerfile` at the repo root: Node stage runs the build → final stage `caddy:alpine` serving `dist`.
   - `deploy/Caddyfile` with: SPA fallback (unknown paths → `/index.html`), headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on all responses, and a commented-out placeholder for a future `reverse_proxy /api/convert/* gotenberg.zeabur.internal:3000` block (Phase 15).
   - The container **must listen on the `PORT` env var** (Zeabur sets it), defaulting to 8080 locally.
8. **Cleanup** — delete the old demo files once the scaffold replaces them: `index.html` (old one at root), `test.html`, `home/`, `vendor/`, `_headers`, `_redirects`.

### Explicitly out of scope for Phase 0

- Any actual tool functionality (no diff checker, no converters — nothing).
- PWA/service worker (Phase 53), Gotenberg service (Phase 15), tool routes beyond stubs.
- Do not add heavy libraries (mermaid, pdf.js, etc.) — they arrive with their tools.

## 3. Architecture conventions you are establishing

These become the pattern for 51 future phases — get them right:

- `src/tools/<tool-slug>/` — one directory per tool (component + worker + tests). Route path = `/tools/<tool-slug>`.
- **Every tool route is lazy-loaded** (`React.lazy` / dynamic import) so tool dependencies never bloat the dashboard bundle. Build the route registry this way from day one, even though it's empty of real tools now.
- A single typed **tool registry** module (e.g. `src/tools/registry.ts`) is the source of truth the dashboard renders from: slug, name, description, category, badge (`client-side` | `server-assisted`), status (`available` | `coming-soon`), icon. Phase 0 ships it with all 51 entries marked `coming-soon`; each future phase flips one entry to `available` and adds its lazy route.
- Tailwind dark mode via the `class` strategy on `<html>`, toggled by the theme setting.
- TypeScript strict; no `any` escapes without a comment justifying it.

## 4. Non-negotiable working rules (from CLAUDE.md)

1. **Every task below ends with `npm run lint` and `npm run typecheck` — both must pass with zero errors before the task counts as complete.** Never defer fixes; never silence a rule to get past it without stating so.
2. No network request may carry user file content (trivially true in Phase 0 — keep it that way).
3. Never touch files on the user's disk; tools work on in-memory copies and produce downloads.
4. Anything that renders user-derived HTML goes through DOMPurify (not needed in Phase 0, but don't create patterns that bypass this later).

## 5. Tool catalog (data for the registry / dashboard cards)

Badge is `client-side` unless noted. Status: all `coming-soon`. Phase numbers are for reference; per-tool details live in PLAN.md.

**Markdown** — Em-dash remover (1): replace/remove em-dashes in text · Double line remover (2): collapse repeated blank lines · Diff checker (3): compare two texts side by side · Markdown renderer (4): live GFM preview with highlighting · Mermaid editor (5): write and render diagrams, export SVG/PNG · Markdown editor (6): full editor with toolbar, images, autosave

**Image** — Image resize (7): resize by pixels/percent, batch · Background remover (8): AI background removal, fully in-browser · Format converter (42): PNG/JPEG/WebP/AVIF · Image compressor (43): shrink photos with quality preview · Crop / rotate / flip (44): precise cropping with presets · EXIF viewer & stripper (45): view and remove photo metadata/GPS · SVG optimizer (46): minify SVG safely · Favicon generator (47): one image → full favicon set · Color palette extractor (48): dominant colors from any image

**Files** — Bulk file hasher (9): SHA/MD5 checksums for many files · Bulk file renamer (10): pattern-rename files, export as zip · Zip / unzip (49): create and extract archives · Duplicate file finder (50): find identical files by content · OCR (51): extract text from images and scans

**PDF & Office** — PDF split / extract (11): pull pages out of a PDF · PDF resize (12): change page dimensions · PDF → image / markdown (13): render pages or extract text · PDF merge (16): combine PDFs in any order · Page reorder / rotate / delete (17): rearrange a PDF visually · PDF watermark (18): stamp text or image · Images → PDF (19): photos into one document · PDF compress (20): shrink heavy PDFs · XLSX / CSV viewer (21): open spreadsheets read-only

**Converters** — DOCX → HTML / Markdown (14): convert Word docs in-browser · DOCX ↔ PDF (15, **server-assisted**): high-fidelity conversion via our server · Markdown → DOCX (22): markdown to Word

**Text & Developer** — JSON formatter (23) · YAML ↔ JSON ↔ TOML (24) · CSV ↔ JSON (25) · Base64 encode/decode (26) · URL encode/decode/parse (27) · Regex tester (28) · Case converter (29) · Word & character counter (30) · UUID / password generator (31) · Timestamp converter (32) · Cron parser (33) · String escape/unescape (34) · Dummy data generator (35) — one-line descriptions: format/validate JSON; convert config formats; convert tabular data; encode text & files; break down URLs; test patterns safely; camelCase/snake_case and friends; count words, chars, tokens; generate secure random IDs; epoch ↔ human dates; explain cron schedules; escape for JSON/HTML/shell; seeded fake data

**Security & Inspection** — Text hasher + HMAC (36): hash text, RFC-correct · JWT decoder (37): inspect tokens locally, nothing sent anywhere · Certificate decoder (38): read X.509/CSR fields from PEM · Hex viewer (39): inspect any file's raw bytes, detect real type · Password strength checker (40): offline zxcvbn analysis · QR generator + reader (41): create and scan QR codes

## 6. Tasks (do them in order)

**T1 — Implementation.** Everything in §2, following §3 conventions. Commit-sized, reviewable steps are fine.
*Gate: `npm run lint` && `npm run typecheck` pass clean.*

**T2 — Functional verification.** Prove, don't assume:
- `npm run dev` serves; `npm run build` succeeds; `npm run test` passes.
- `docker build` succeeds; run the container locally and confirm with `curl -I`: COOP/COEP headers present on `/`, SPA deep link (e.g. `/tools/anything`) returns the app not a 404 from Caddy, container honors `PORT`.
- Theme toggle persists across reload with no flash of wrong theme.
- All 7 categories and 51 cards render from the registry; search filter narrows them; badges correct (exactly one `server-assisted`: DOCX ↔ PDF).
- `FileDropzone` accepts both drag-drop and click-pick; `downloadBlob`/`downloadZip` produce valid files (open the zip).
- Unknown route shows the 404 page.
- Browser network log shows no unexpected outbound requests.
*Gate: lint + typecheck pass clean.*

**T3 — Visual inspection.** Use Playwright (webapp-testing skill) against the dev or preview build. Screenshot the dashboard and the 404 page at **1280px and 390px** widths, in **light and dark** mode (8 screenshots minimum). Check: card grid wraps cleanly on mobile, no horizontal overflow, coming-soon cards look intentional, header/nav usable at 390px, focus states visible. Fix everything found.
*Gate: lint + typecheck pass clean.*

**T4 — Second-pass visual verification (closes the phase).** After all T2/T3 fixes: fresh `npm run build && npm run preview`, re-take all T3 screenshots, confirm every previously found issue is resolved and nothing regressed. Only then is Phase 0 done.
*Gate: lint + typecheck pass clean.*

## 7. Definition of done

Phase 0 is complete when: all four tasks passed their gates; the container runs locally with correct headers and SPA routing; the dashboard shows all 51 coming-soon cards in 7 categories with working search and theme toggle; shared components/utilities exist with tests; old demo files are gone; and no defect from T2/T3 remains open. Do not begin Phase 1.
