# NYMBX Toolbox

Privacy-first, browser-based all-in-one toolbox. All file processing happens **client-side in the browser** — user files must never leave the device. The site is static files with no backend, so there are no server-assisted tools.

The full roadmap lives in [PLAN.md](PLAN.md). Work proceeds one phase (= one tool) at a time; do not start a new phase while the current one has open defects.

## Ownership

This repository is owned and managed by GitHub user `Mojo7823`.

- Treat this as a personal project, not a repository owned by the shared company account `Auray-expert`.
- Use `Mojo7823` for repository ownership and account-dependent GitHub operations. Verify the active account before using `gh`; do not assume the machine's default account is correct.

## Platform routes

- Main domain: `https://nymbx.dev`.
- `/` redirects to `/tools`, preserving query strings and URL fragments.
- `/tools` is the toolbox homepage; individual tools live at `/tools/<slug>`.
- `/contact` contains the original portfolio and contact homepage.
- Internal toolbox navigation must point directly to `/tools`, not `/`.

## Stack

- Vite + React 19.2 + TypeScript (strict) + Tailwind CSS
- React Router — one lazy-loaded route per tool
- Web Workers (Comlink) for heavy work; WASM libraries where needed
- IndexedDB (`idb`) for drafts/settings only — never user files
- Vitest for unit tests; Playwright (webapp-testing skill) for visual/E2E
- Deployed as static files (`dist`) on Cloudflare Workers static assets (the successor to Pages), configured in `wrangler.jsonc` with no Worker script. Response headers (COOP/COEP, CSP, cache rules) live in `public/_headers`; SPA fallback is `not_found_handling`. Every file must stay under the 25 MiB per-file limit
- `nymbx.dev` and `www.nymbx.dev` are Workers custom domains (`routes` in `wrangler.jsonc`); pushes to `main` build and deploy through Cloudflare Workers Builds (`npm run build`, then `npx wrangler deploy`)

## Commands

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run preview` — serve the production build
- `npm run lint` — ESLint + Prettier check
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` — Vitest
- `npx --yes wrangler@4 deploy` — manual upload of `dist` to Cloudflare (run `npm run build` first; normally Workers Builds does this on push)

## Hard rules for agents

1. **Lint and typecheck gate every task.** Before marking ANY task complete, run `npm run lint` and `npm run typecheck`. Both must pass with zero errors. Fix issues immediately — never defer them, never disable a rule to get past it without saying so.
2. **Privacy invariant.** No network request may contain user file content. When verifying a tool, check the browser network log while exercising it with a real file.
3. **Lazy-load heavy dependencies.** Tool-specific libraries (mermaid, pdf.js, pdf-lib, background-removal, hash-wasm, shiki, …) must be imported only inside the tool's route/module so the dashboard stays light. Check bundle output after adding a dependency.
4. **Sanitize all rendered HTML.** Anything derived from user input that gets rendered (markdown preview, DOCX conversion output) goes through DOMPurify. XSS test cases are part of verification for those tools.
5. **Every phase ends with visual verification.** T3 (visual inspection) and T4 (second-pass visual verification on a fresh production build) per the template in PLAN.md — screenshots at 1280px and 390px, light and dark theme.
6. **Keep the tool-page pattern consistent.** New tools use `ToolLayout`, `FileDropzone`, and the shared download/worker utilities from Phase 0 rather than reinventing them.
7. **Never touch files on the user's disk.** Tools operate on in-memory copies of dropped/selected files and produce downloads (single file or zip); they must not modify or delete originals. Any operation that could produce surprising output (e.g. name collisions in bulk rename) blocks with an accurate preview instead of guessing.

## Layout conventions

- The portfolio and contact page uses `src/pages/Landing.tsx` + `src/components/landing/`; toolbox routes are lazy-loaded via `src/pages/ToolboxRoutes.tsx`. URLs are listed in Platform routes above.
- `src/tools/<tool-name>/` — one directory per tool (component, worker, tests)
- `src/components/` — shared UI (ToolLayout, FileDropzone, Button, Toast, …)
- `src/lib/` — shared utilities (download, zip, worker helper, settings store)
- `wrangler.jsonc` + `public/_headers` — Cloudflare hosting config and production response headers
- `docs/handouts/` — self-contained per-phase briefs for delegated agents (e.g. `phase-0-foundation.md`)
- Route slug = directory name (e.g. `/tools/diff-checker` ↔ `src/tools/diff-checker/`)
