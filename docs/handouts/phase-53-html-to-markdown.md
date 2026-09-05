# Phase 53 Handout — HTML → Markdown

**Audience:** the agent implementing Phase 53 (T1) and the agents verifying it (T2–T4). Self-contained; read fully before writing code. [/PLAN.md](../../PLAN.md) (Phase 53) and [/CLAUDE.md](../../CLAUDE.md) are authoritative if anything here seems ambiguous.

---

## 1. Goal

Add **HTML → Markdown** at `/tools/html-to-markdown` (`src/tools/html-to-markdown/`): paste HTML or drop an `.html`/`.htm`/`.xhtml` file, get clean GFM Markdown with a live rendered preview, copy or download it. Entirely in the browser; no network activity.

Registry entry exists (`slug: 'html-to-markdown'`, `phase: 53`, `status: soon`, icon `Code`). Flip it to `'available'`, add the lazy route in `src/tools/routes.ts` (`'html-to-markdown': lazy(() => import('./html-to-markdown/HtmlToMarkdown'))`), and insert `'html-to-markdown'` into the "available" list in `src/lib/registry.test.ts` **in registry order** (after `'markdown-to-docx'`).

## 2. Library facts (verified 2026-09-05 via context7 and the installed packages)

All three libraries are already dependencies (Phase 14 uses them). Import them **only inside this tool's files** and lazily (`await import('turndown')`, `await import('turndown-plugin-gfm')`), as `convertDocx.ts` does.

**turndown 7.2.4** — `new TurndownService(options)`; `turndown(input)` accepts an HTML string **or a DOM node** (element, fragment). Options used here: `headingStyle: 'atx' | 'setext'`, `bulletListMarker: '-' | '*' | '+'`, `codeBlockStyle: 'fenced'`, `fence: '```' | '~~~'`, `emDelimiter: '_' | '*'`, `strongDelimiter: '**'`, `hr: '---'`, `linkStyle: 'inlined'` (do **not** offer `referenced` — reference numbering would restart in every batch, see §4). Rules: `turndown.addRule(key, { filter, replacement })`, `turndown.remove([...tags])`, `turndown.keep([...tags])`. Fenced code takes the language from a `<code class="language-xxx">` (and `lang-xxx`) child of `<pre>`; the GFM plugin's `highlightedCodeBlock` handles `<div class="highlight highlight-source-js">` wrappers. `<pre>` without `<code>` becomes a fence with no language.

**Crucial:** turndown's browser build parses strings with `DOMParser` and falls back to `document.implementation.createHTMLDocument`; **neither exists in a Web Worker**, so turndown must run on the main thread. Responsiveness for large inputs comes from batching (§4), not from a worker. PLAN.md Phase 53 was corrected accordingly.

**turndown-plugin-gfm 1.0.2** — `turndown.use(gfm)` adds tables, strikethrough (`<del>`, `<s>`, `<strike>` → `~~`), task list items (`<li><input type="checkbox" checked>` → `- [x]`), highlighted code blocks. Known limitation: a table is only converted when it has a `<th>` header row; otherwise it is kept as raw HTML. Phase 14's `prepareTablesForMarkdown` promotes the first row to `<th>` and flattens block children in cells — reuse it (§3). GFM cells are single-line: keep Phase 14's `cellLineBreak` rule (`<br>` inside a cell → literal `<br>`). The plugin ships no types; the shim `src/tools/docx-to-html-markdown/gfm-plugin.d.ts` declares the module — **move it to `src/lib/turndown-plugin-gfm.d.ts`** (do not duplicate it).

**DOMPurify 3.4.12** — `DOMPurify.sanitize(html, { RETURN_DOM: true })` returns a sanitized **`<body>` element** (one parse, no re-serialization), which is exactly what the batched conversion needs. Defaults already drop `<script>`, event-handler attributes, `javascript:` URLs, `<iframe>`; add `FORBID_TAGS: ['style', 'noscript', 'template']` and keep `<input>` so task-list checkboxes survive (they do by default). `<svg>`/`<math>` may be forbidden too (they never convert to useful Markdown). Everything the user sees or downloads derives from this sanitized DOM.

## 3. Shared helper — refactor, do not duplicate

Create **`src/lib/htmlToMarkdown.ts`** and move into it, from `src/tools/docx-to-html-markdown/convertDocx.ts`:

- `prepareTablesForMarkdown(root: ParentNode | string)` — accept a DOM root as well as an HTML string (the string form keeps Phase 14 working unchanged).
- `createTurndown(options: TurndownOptions)` returning a configured `TurndownService`: `atx`/fenced/`-`/`---` defaults, `gfm` plugin, the `cellLineBreak` rule, and the optional rules below. Phase 14 calls `createTurndown({})` and must produce byte-identical Markdown to today — its tests (`convertDocx.test.ts`) stay green.

Options this tool adds (all implemented as turndown rules/`remove()` on the sanitized DOM, never as regexes on strings):

```ts
export interface TurndownOptions {
  headingStyle?: 'atx' | 'setext'      // default 'atx'
  bulletListMarker?: '-' | '*' | '+'   // default '-'
  fence?: '```' | '~~~'                // default '```'
  emDelimiter?: '_' | '*'              // default '_'
  images?: 'keep' | 'alt' | 'drop'     // default 'keep'; 'alt' emits the alt text only; 'drop' removes them
  links?: 'keep' | 'text'              // default 'keep'; 'text' unwraps to the link text
  baseUrl?: string                     // when set, relative href/src are resolved with new URL(rel, baseUrl); otherwise kept verbatim
  skipChrome?: boolean                 // default true: remove nav, header, footer, aside (script/style/noscript/template are always removed)
}
```

Add `src/lib/htmlToMarkdown.test.ts` covering: each option; tables with and without `<th>`; nested lists (3 levels); `<pre><code class="language-ts">` → ` ```ts `; inline code, strong, em, del; task-list checkboxes; relative URLs verbatim vs resolved against `baseUrl`; `<br>` inside a cell; `<script>`/`onerror`/`javascript:` never appear in the output; malformed HTML (unclosed tags, mis-nesting) converts without throwing.

## 4. Conversion pipeline — responsive by construction

`src/tools/html-to-markdown/convert.ts`:

```ts
export interface ConvertProgress { done: number; total: number }
export async function htmlToMarkdown(html: string, options: TurndownOptions, onProgress?: (p: ConvertProgress) => void, signal?: AbortSignal): Promise<string>
```

1. `const body = DOMPurify.sanitize(html, { RETURN_DOM: true, FORBID_TAGS: [...] })` — a `<body>` element. (If the input is a full document, `<head>` content is discarded by DOMPurify already; `<title>` is not part of the output.)
2. Apply `skipChrome` removal and `baseUrl` rewriting on this DOM (`querySelectorAll('a[href], img[src]')`), then `prepareTablesForMarkdown(body)`.
3. **Batch** the body's top-level children into groups of roughly 200 nodes, never splitting a run of consecutive inline/text nodes (group them with the next block so a paragraph written as bare inline nodes is not cut). For each group: move the nodes into a `DocumentFragment`, `turndown.turndown(fragment)`, push the result, `onProgress`, then `await new Promise((r) => setTimeout(r, 0))` so the UI paints; check `signal.aborted` between batches and throw a `ConvertCancelled` error.
4. Join batch results with `\n\n`, collapse 3+ consecutive blank lines to one, trim. For inputs under ~200 KB this is effectively synchronous (one batch); for the 5 MB test page it must keep the tab responsive and show progress.

Unit-test the batching (`convert.test.ts`): output equals the unbatched `turndown.turndown(body)` result for a mixed document (modulo the blank-line normalization), progress is monotonic and reaches `total`, and cancel rejects with `ConvertCancelled`.

## 5. UX specification

Use `ToolLayout` (`title="HTML → Markdown"`, `description="Turn any HTML page or snippet into clean Markdown, in your browser"`, `badge="client-side"`). Look at `src/tools/em-dash-remover/EmDashRemover.tsx` (paste UX, `SplitPane`), `src/tools/docx-to-html-markdown/DocxToHtmlMarkdown.tsx` (dropzone + output tabs + download) and `src/tools/markdown-renderer/MarkdownRenderer.tsx` (`createRenderer`, `renderMarkdown`, `preview.css`, the `md-preview` class) for conventions.

1. **Input (left pane):** a textarea "Paste HTML here" **and** a compact `FileDropzone` (`accept=".html,.htm,.xhtml,text/html,application/xhtml+xml"`, single file, max 20 MB) above or below it; dropping a file fills the textarea (for files over 1 MB show the size and a note "large file — the editor shows the first 200 KB; conversion uses the whole file" and keep the full string in state, not in the textarea). Character/byte count under the textarea.
2. **Options row:** Heading style (ATX `#` / Setext), Bullet (`-` `*` `+`), Fence (```` ``` ```` / `~~~`), Emphasis (`_` / `*`), Images (Keep / Alt text only / Drop), Links (Keep / Text only), "Skip navigation, headers, footers and sidebars" checkbox (default on), and an optional **Base URL** text field ("Resolve relative links against…", placeholder `https://example.com/page`). Options persist via the settings store (`src/lib/settings.ts`, add a typed key) — they are settings, not user content. **Never persist the HTML or the Markdown.**
3. **Output (right pane):** tabs **Markdown** (read-only `<textarea>`/`<pre>` with the result, Copy button, Download `.md`) and **Preview** (render the Markdown through Phase 4's `createRenderer()` + `renderMarkdown()`, reusing `preview.css` and the `md-preview` class; import from `../markdown-renderer/renderMarkdown` — cross-tool imports have precedent). Conversion is live with a 250 ms debounce (`useDebouncedValue`); while a large conversion runs show a `ProgressBar` with `Converting… 42 %` and a Cancel button; the previous result stays visible until the new one lands.
4. **Stats line:** `12.4 KB HTML → 3.1 KB Markdown · 3 tables · 2 images · 14 links` (count on the sanitized DOM).
5. **Download** filename: `<source>.md` for a dropped file, `converted.md` for pasted input. Copy uses `CopyButton`.
6. **Errors/empty states:** empty input → placeholder; a file that is not text (binary sniff: NUL bytes in the first 1 KB) → toast "This does not look like an HTML file"; conversion failure → error card with message, input preserved.
7. **Privacy note** under the tool: "Nothing is uploaded. Scripts, styles and event handlers are stripped before conversion."
8. **Security:** the Markdown text is inert, and the Preview is rendered only through `renderMarkdown` (DOMPurify). Never insert the *input* HTML into the DOM.

## 6. Code layout

```
src/lib/htmlToMarkdown.ts (+ .test.ts)          shared: prepareTablesForMarkdown, createTurndown, TurndownOptions
src/lib/turndown-plugin-gfm.d.ts                 moved from the docx tool
src/tools/html-to-markdown/
  HtmlToMarkdown.tsx      page: input pane, options, output tabs, stats, progress
  convert.ts (+ .test.ts) sanitize → chrome/baseUrl → tables → batched turndown, progress, cancel
  stats.ts (+ .test.ts)   counts (tables, images, links) and size formatting for the stats line
```

Strict TS, no `any`. Confirm with `npm run build` that the dashboard entry chunk (`dist/assets/index-*.js`) is unchanged.

## 7. Tasks (T1 — in order; `npm run lint` and `npm run typecheck` after each step; `npm run test` at the end)

1. Move the GFM type shim to `src/lib/`; create `src/lib/htmlToMarkdown.ts` by moving Phase 14's helpers; rewire `convertDocx.ts`; its tests stay green.
2. Options and rules in `createTurndown` with tests (§3).
3. `convert.ts` batching with tests (§4).
4. `stats.ts` with tests.
5. `HtmlToMarkdown.tsx` per §5; route, registry status, registry test.
6. `npm run build`; compare the entry chunk size to main (must be unchanged).
7. Browser smoke test (Python Playwright, production build served by `npx vite preview --port 4173 --strictPort --host 127.0.0.1` **from the repo root**): paste the contents of `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/html-assets/rich.html`, print the Markdown, switch to Preview and confirm the table renders as a `<table>`; drop `xss.html` and assert the Markdown contains no `<script`, `onerror`, `javascript:`; record all requests (same-origin GETs only). Stop the preview with `kill <pid>` of the node process (`ss -ltnp | grep 4173`), never `pkill -f`.

Do not commit. Report: files, gate numbers, entry chunk before/after, smoke-test output, decisions the handout did not cover, anything unfinished.

## 8. Verification (T2/T3, by the verifier)

Assets in `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/html-assets/`: `rich.html` (headings, nested lists, ordered list, tables with and without `<th>`, a `<br>` in a cell, fenced code with `language-ts` and `lang-bash`, plain `<pre>`, nested blockquote, hr, task list, three image kinds incl. relative and data URI, relative and absolute links, special characters, CJK), `xss.html`, `malformed.html`, `big.html` (5.0 MB, 30 413 paragraphs), `saved-page.html` (nav/header/aside/footer noise around an `<article>`).

Checks:
1. **Fidelity on rich.html:** the Markdown has `#`/`##` headings, a 3-level nested list with the chosen marker, an ordered list, both tables as pipe tables (the headerless one with its first row promoted), the in-cell `<br>` preserved, ` ```ts ` and ` ```bash ` fences with the code verbatim (including `<not a tag>` unescaped inside the fence), a plain fence for the bare `<pre>`, nested `>` quotes, `---`, `- [x]`/`- [ ]`, images as `![alt](src "title")` with the **relative path verbatim**, links with relative paths verbatim, `~~removed~~`, and the special-characters line with correct escaping (`5 \* 3`, `\[brackets\]`, `1\. not a list`). Render the Markdown through the Preview tab and confirm it round-trips to the same structure (tables, lists, code).
2. **Options:** each control changes the output as labelled (marker, fence, heading style, emphasis, images keep/alt/drop, links keep/text, Base URL `https://example.com/docs/page.html` turns `../relative/path.html` into `https://example.com/relative/path.html` and `images/diagram.png` into `https://example.com/docs/images/diagram.png`); options persist across a reload; the HTML/Markdown content does **not** persist (check IndexedDB/localStorage).
3. **XSS:** with `xss.html`, the Markdown contains none of `<script`, `onerror`, `onclick`, `onmouseover`, `javascript:`, `<iframe`, `onload`; the Preview DOM contains no `script`/`iframe` elements and no `on*` attributes; `document.title` is unchanged; no console errors.
4. **Malformed:** `malformed.html` converts without an error, output contains the heading, three list items and the table content.
5. **Chrome skipping:** `saved-page.html` with the checkbox on yields no "Home", "About", "Buy now!", "Footer links"; off yields them.
6. **5 MB page:** paste/drop `big.html` → progress visible, the tab stays responsive (a click on an option registers within 300 ms during conversion), completes in a reasonable time (report it), output paragraph count ≈ 30 413 (count `Lorem ipsum` occurrences), Cancel mid-way stops it and the previous result stays.
7. **Privacy:** all requests are same-origin GETs; no request body ever carries the HTML.
8. **Download/copy:** `.md` download content equals the Markdown pane; filename `rich.md` for the dropped file, `converted.md` for pasted input.
9. **Console/pageerror:** none. **Gates:** report numbers.

Visual (T3): 1280 and 390, light and dark: empty state, rich.html converted (Markdown tab), Preview tab, options row (check wrapping at 390), conversion in progress on big.html. `scrollWidth <= viewport` everywhere; the two panes stack on 390 px.

## 9. Definition of done

Gates green; every §8 check passes on a fresh production build (T4); PLAN.md Phase 53 needs no change unless a decision diverged — if so, update it in the same commit and say which.
