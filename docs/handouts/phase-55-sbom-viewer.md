# Phase 55 Handout — SBOM viewer / validator

**Audience:** the agent implementing Phase 55 (T1) and the agents verifying it (T2–T4). Self-contained; read fully before writing code. [/PLAN.md](../../PLAN.md) (Phase 55) and [/CLAUDE.md](../../CLAUDE.md) are authoritative if anything here seems ambiguous.

---

## 1. Goal

Add **SBOM viewer** at `/tools/sbom-viewer` (`src/tools/sbom-viewer/`): drop a **CycloneDX** (JSON or XML) or **SPDX 2.x JSON** software bill of materials and get a summary, a searchable and sortable components table, a license summary, a dependency tree, a vulnerabilities section when present, **JSON-schema validation with precise error paths**, and a CSV export of the components. Everything in the browser; the schemas are bundled, so no network request is ever made for a document.

Registry entry exists (`slug: 'sbom-viewer'`, `phase: 55`, `status: soon`, icon `PackageSearch`). Flip it to `'available'`, add the lazy route in `src/tools/routes.ts`, and insert `'sbom-viewer'` into the "available" list in `src/lib/registry.test.ts` **in registry order** (after `'qr-generator-reader'`).

## 2. Library facts (verified 2026-09-05 via context7 and a Node prototype)

Add **`ajv@^8`** and **`ajv-formats@^3`** (ajv 6 is present transitively for ESLint; do not use it). Both import only inside this tool's worker.

- `import Ajv from 'ajv'` (draft-07 by default — all bundled schemas are draft-07). Create it with `new Ajv({ allErrors: true, strict: false, validateFormats: true })`. **`strict: false` is required**: the CycloneDX schemas use `$comment`, `examples`, `deprecated`, `meta:enum` and `x-trust-boundary`, which strict mode rejects.
- `import addFormats from 'ajv-formats'`; `addFormats(ajv)` covers `date-time` and `uri`. The schemas also use **`iri-reference`** (47×) and **`idn-email`** (6×), which ajv-formats does not ship — register them permissively: `ajv.addFormat('iri-reference', true); ajv.addFormat('idn-email', true)` (a `true` format always passes; say so in a comment — structural validation is what we promise, not IRI grammar).
- The CycloneDX schemas `$ref` two sibling schemas by relative URL, resolved against their `$id` (`http://cyclonedx.org/schema/bom-1.6.schema.json`): **`spdx.schema.json`** (license-id enum, `$id` `http://cyclonedx.org/schema/spdx.schema.json`) and **`jsf-0.82.schema.json`** (signatures). `ajv.addSchema(spdxIds); ajv.addSchema(jsf)` before `ajv.compile(bom)` resolves them. bom-1.2 and 1.3 reference only `spdx.schema.json`.
- `validate(data)` → boolean; `validate.errors` → `ErrorObject[]` with `instancePath` (JSON Pointer such as `/components/0/type`), `keyword`, `params`, `message`. Prototype results on the official samples: laravel 1.4 (140 KB) 4 ms, Keycloak 1.2 (2.2 MB, 903 components) 97 ms, all SPDX 2.3 examples < 3 ms; an invalid document yields e.g. `/components/0/type must be equal to one of the allowed values` and `/components/0/name must be string`. Compiling the 1.6 schema costs a few hundred ms once — cache compiled validators per spec version in the worker.
- Ajv **compiles schemas to JavaScript with `new Function`**. The site sends no Content-Security-Policy today, so this works; leave a comment that a future CSP would need `'unsafe-eval'` or Ajv's standalone precompilation.
- **Workers have no `DOMParser`**, so CycloneDX **XML** is parsed on the main thread with `new DOMParser().parseFromString(text, 'application/xml')` (check for `<parsererror>`), normalized there, and is **not schema-validated** (that would need XSD). Say so in the UI: "XML documents are parsed but not schema-validated; convert to JSON for validation."

## 3. Schemas — bundled source, with provenance

Commit these under **`src/tools/sbom-viewer/schemas/`** (they are Apache-2.0 / CC-BY-3.0 documents; ~690 KB of JSON, comparable to earlier committed assets) together with a `SOURCES.md` listing URL, pinned commit and SHA-256 per file. Pre-downloaded copies are in `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/sbom-assets/`; re-download from the pinned commits below if you prefer and check the hashes match.

| file | source | sha256 |
|---|---|---|
| `bom-1.2.schema.json` | `CycloneDX/specification` commit `595d98f16159bdf7463adc140509ded479130b8b`, `schema/bom-1.2.schema.json` | `4a84031ce547f2e7fef0c80b334448a2e130c10a31117d038d2c4d2849740622` |
| `bom-1.3.schema.json` | same commit, `schema/bom-1.3.schema.json` | `d1e14fde4cf66934ddc31714cdbc3ec3103b15d039dbfb7a05a27bd44b547df0` |
| `bom-1.4.schema.json` | same, `schema/bom-1.4.schema.json` | `c22ea18d8ede3dbacc22bff3d3216fffe4c7c2b645a20af6aa223dceaaabb596` |
| `bom-1.5.schema.json` | same, `schema/bom-1.5.schema.json` | `2d956c1d05c092695457a91f3b5c57c749793c013ec224a0935807cfc8ae4480` |
| `bom-1.6.schema.json` | same, `schema/bom-1.6.schema.json` | `18f57f7482593bad9f21b4feed09084640cbeff419d62ad5090c5ceccca5b37d` |
| `spdx.schema.json` (CycloneDX license-id enum) | same, `schema/spdx.schema.json` | `ea6e844ee6fba1e93473d94834d0ee0996970533497935f932f73d488ffdf4a3` |
| `jsf-0.82.schema.json` | same, `schema/jsf-0.82.schema.json` | `8bae002c25e723db7ee1f26afde680ae1a2b1a8f6b4b4b0fd65dc3becb090aae` |
| `spdx-2.3.schema.json` | `spdx/spdx-spec` tag `v2.3` (commit `aadf3b0b8dbbabdb4d880b0fc714255fea436ff7`), `schemas/spdx-schema.json` | `239208b7ac287b3cf5d9a9af23f9d69863971102a5e1587a27a398b43490b89b` |

Load them with **dynamic JSON imports per spec version** (`await import('./schemas/bom-1.6.schema.json')`) inside the worker, so Vite emits one hashed, immutably cached chunk per schema and a document only pulls the schema it needs (plus `spdx.schema.json` and `jsf-0.82.schema.json` for CycloneDX). No copy script, no Caddyfile change, no `public/` files. Add `resolveJsonModule` is already on if `import ... from '*.json'` type-checks; otherwise import with `import.meta.glob` or declare the module — keep strict TS.

Version mapping: CycloneDX `specVersion` `1.2`–`1.6` → that schema; SPDX `spdxVersion` `SPDX-2.2` or `SPDX-2.3` → the 2.3 schema (2.2 documents validate against it in practice; label the result "validated against SPDX 2.3"). Other versions: parse and show "no bundled schema for version X — not validated" rather than failing.

## 4. Normalized model (pure, shared by JSON/XML/SPDX paths)

`src/tools/sbom-viewer/model.ts`:

```ts
export interface SbomComponent { ref: string | null; name: string; version: string; type: string; supplier: string; licenses: string[]; purl: string; cpe: string; hashes: { alg: string; value: string }[]; description?: string }
export interface SbomVulnerability { id: string; source: string; severity: string; score: number | null; affects: string[]; description: string }
export interface SbomDocument {
  format: 'CycloneDX' | 'SPDX'; specVersion: string; serialNumber: string | null; created: string | null
  tools: string[]; subject: { name: string; version: string } | null       // metadata.component / documentDescribes
  components: SbomComponent[]; dependencies: Map<string, string[]>          // ref → dependsOn refs
  vulnerabilities: SbomVulnerability[]; warnings: string[]                  // e.g. "3 dependency refs point to unknown components"
}
```

- **CycloneDX JSON** (`normalizeCycloneDx(json)`): `components[]` (recurse into nested `components`), `metadata.{timestamp, tools (array form 1.2–1.4 and `tools.components` form 1.5+), component}`, licenses from `licenses[].license.{id|name}` and `licenses[].expression`, `purl`, `cpe`, `hashes[].{alg, content}`, `supplier.name`, `dependencies[].{ref, dependsOn}`, `vulnerabilities[].{id, source.name, ratings[0].{severity, score}, affects[].ref, description}`.
- **CycloneDX XML** (`normalizeCycloneDxXml(doc: Document)`): same fields from the `bom` namespace (`getElementsByTagNameNS('*', …)`); `specVersion` from the namespace URI `http://cyclonedx.org/schema/bom/1.x`.
- **SPDX JSON** (`normalizeSpdx(json)`): `packages[]` → components (`name`, `versionInfo`, `supplier` stripped of the `Organization:`/`Person:` prefix, `licenseConcluded` + `licenseDeclared` (skip `NOASSERTION`/`NONE`), `externalRefs[]` with `referenceType` `purl` / `cpe23Type`, `checksums[].{algorithm, checksumValue}`), `creationInfo.{created, creators}` (tools = entries starting with `Tool:`), `documentDescribes` → subject, `relationships[]` → dependencies (`DEPENDS_ON`, `CONTAINS`, `DYNAMIC_LINK`, `STATIC_LINK` → parent→child; `DEPENDENCY_OF` → reversed). Refs are `SPDXRef-…` ids.
- Derived (pure helpers, unit-tested): `licenseSummary(components)` (id → count, unknown/none counted), `dependencyTree(doc)` (roots = subject or components nobody depends on; children resolved by ref; cycle-safe; unresolved refs collected into `warnings`), `componentsToCsv(components)` (RFC 4180, columns name, version, type, supplier, licenses, purl, cpe, hashes), `filterSort(components, query, column, dir)`.

## 5. Processing pipeline

`sbom.worker.ts` (Comlink, like other tools): `analyzeJson(text) → { doc: SbomDocument, validation: { schema: string | null; valid: boolean | null; errors: { path: string; message: string; keyword: string }[] } }`. Steps: `JSON.parse` (a syntax error → a clear "not valid JSON" result with the parser's message), detect format (`bomFormat === 'CycloneDX'` or `spdxVersion`), pick the schema, validate with the cached Ajv validator, normalize. Cap the error list at 200 and report the total. XML path runs on the main thread (`analyzeXml(text)`), returns the same shape with `validation.valid === null` and `schema: null`.

Large files: the 10k-component sample is 4.2 MB; `JSON.parse` + validation + normalization must run in the worker so the UI never freezes, with a `ProgressBar` (indeterminate) while it runs. Reject files over 50 MB with a toast.

## 6. UX specification

Use `ToolLayout` (`title="SBOM viewer"`, `description="Inspect and validate CycloneDX and SPDX software bills of materials, in your browser"`, `badge="client-side"`) and `FileDropzone` (`accept=".json,.xml,.cdx.json,.spdx.json,.bom.json,application/json,text/xml,application/xml"`, single file, 50 MB). Conventions: `src/tools/xlsx-csv-viewer/XlsxCsvViewer.tsx` for the virtualized table (move `visibleRange`, `compareCells`, `SortDir` from its `gridMath.ts` into **`src/lib/gridMath.ts`** and re-export from the tool so its tests stay green), `src/tools/certificate-decoder/` for the "paste or drop, then structured read-only view" pattern, `src/tools/pdf-sign-annotate/` for tabs.

1. **Input:** dropzone **or** a paste textarea ("Paste SBOM JSON or XML") — many SBOMs arrive as text. One-line note: "Stays in your browser. Schemas are bundled, so nothing is fetched while you inspect a file."
2. **Summary card:** format badge (`CycloneDX 1.6` / `SPDX 2.3`), subject name/version, created timestamp (formatted, with the raw value on hover), tools, counts (components, dependencies edges, vulnerabilities, licenses), serial number, and the **validation badge**: green `Valid against CycloneDX 1.6 schema`, red `12 schema errors`, or grey `Not validated (XML)` / `No bundled schema for …`.
3. **Tabs:** **Components** (default) · **Licenses** · **Dependencies** · **Vulnerabilities** (with a count badge; hidden when none) · **Validation** (count badge; red when errors).
4. **Components tab:** search box (matches name, version, purl, cpe, licenses, supplier), column headers sortable (name, version, type, supplier, licenses, purl); the table is **virtualized** with a fixed row height (10k rows must scroll smoothly); a row click expands a details panel (all fields, hashes with a Copy button each, description). Toolbar: `Export CSV` (filtered + sorted rows, `<stem>.components.csv`) and `Copy PURLs` (one per line).
5. **Licenses tab:** table license → count (sorted by count), each row expandable to the component names; a summary line (`14 distinct licenses · 3 components without license information`); expressions listed as-is.
6. **Dependencies tab:** collapsible tree from the roots; each node shows name@version and a child count; nodes already expanded elsewhere in the tree show a "(shown above)" marker to keep cycles finite; a "Expand all / Collapse all" pair (Expand all disabled above 2 000 nodes with a hint). Unresolved refs listed under a warning.
7. **Vulnerabilities tab:** table id (link to the source URL when present — `target=_blank rel=noopener`), severity (coloured badge: critical/high/medium/low/info/unknown), score, affected components (resolved to names when possible), description.
8. **Validation tab:** list of errors as `path — message` with the keyword in a muted chip; a "Copy report" button; when valid, a green summary; for XML the explanation from §2.
9. **Errors/empty states:** invalid JSON → the parser message and the byte offset if available; unknown format ("This JSON is neither CycloneDX (`bomFormat`) nor SPDX (`spdxVersion`)"); XML parse error → the `<parsererror>` text; nothing hangs.
10. **Privacy/persistence:** nothing persisted (not even preferences — there are none worth saving); no network.

## 7. Code layout

```
src/lib/gridMath.ts (+ .test.ts)           visibleRange / compareCells / SortDir moved from the xlsx viewer
src/tools/sbom-viewer/
  schemas/*.json + SOURCES.md               bundled schemas (§3)
  SbomViewer.tsx                            page: input, summary, tabs
  ComponentsTable.tsx                       virtualized, searchable, sortable table + details panel
  DependencyTree.tsx                        collapsible tree
  model.ts (+ model.test.ts)                types, normalizeCycloneDx, normalizeCycloneDxXml, normalizeSpdx, licenseSummary, dependencyTree, componentsToCsv, filterSort, severity ordering
  validate.ts (+ validate.test.ts)          Ajv setup, schema selection, error mapping (runs in the worker; unit-tested in Node with the bundled schemas against small fixtures incl. an invalid one)
  sbom.worker.ts                            Comlink: analyzeJson
  detect.ts (+ .test.ts)                    JSON vs XML sniffing, format/version detection, file-name stem
```

Strict TS, no `any`. `ajv`, `ajv-formats` and the schema JSON only reach the worker chunk. Confirm with `npm run build` that the dashboard entry chunk is unchanged and that the schemas appear as separate hashed chunks.

## 8. Tasks (T1 — in order; `npm run lint` and `npm run typecheck` after each step; `npm run test` at the end)

1. `npm i ajv@^8 ajv-formats@^3`; schemas + `SOURCES.md` in place (verify the SHA-256s).
2. `src/lib/gridMath.ts` extraction; xlsx viewer rewired; its tests green.
3. `model.ts` + tests (fixtures: a small CycloneDX 1.6 JSON with nested components, licenses as ids/names/expressions, hashes, deps incl. an unresolved ref and a cycle, two vulnerabilities; a CycloneDX 1.4 XML snippet; an SPDX 2.3 document with `DEPENDS_ON` and `DEPENDENCY_OF`).
4. `validate.ts` + tests (valid 1.6 fixture → valid; the invalid document below → the expected paths; SPDX fixture → valid; unknown version → `schema: null`).
5. `detect.ts`, `sbom.worker.ts`.
6. UI per §6; route, registry status, registry test.
7. `npm run build`; entry chunk unchanged.
8. Browser smoke test (Python Playwright, `vite preview` **from the repo root** on 127.0.0.1:4173): drop `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/sbom-assets/laravel-cdx-1.4.json` → summary shows `CycloneDX 1.4`, 62 components, valid badge; drop `invalid-cdx.json` → Validation tab lists errors including `/components/0/type` and `/components/0/name`; drop `spdx-maven.json` → `SPDX 2.3`, 6 components, valid; record all requests (same-origin GETs only). Stop the preview with `kill <pid>` of the node process, never `pkill -f`.

Do not commit. Report: files, gate numbers, entry chunk before/after, schema chunk names/sizes, smoke-test output, decisions the handout did not cover, anything unfinished.

## 9. Verification (T2/T3, by the verifier)

Assets in `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/sbom-assets/`: official samples `laravel-cdx-1.4.json` (1.4, 62 components, 63 dependency entries = 113 edges), `juice-shop-cdx.json` (1.2, 840 components) and `juice-shop-cdx.xml`, `dropwizard-cdx.json` (1.2, 167 components, 167 deps), `keycloak-cdx.json` (1.2, 2.2 MB, 903 components), `cern-cdx.xml`, `vex-cdx.json` (1.4, 1 vulnerability, 0 components), SPDX 2.3: `spdx-maven.json` (6 packages, 7 relationships), `spdx-sbom11.json`, `spdx-acme.json`, `spdx-security.json`; synthetic: `invalid-cdx.json` (bad `type` enum, `version` as number, missing `name`, bad hash content, bad license id, `dependsOn` as string, bad timestamp, tools as string), `big-10k-cdx.json` (1.6, 4.2 MB, 10 000 components, deps, 2 vulnerabilities, license expressions).

Checks:
1. **Official samples load and validate:** every JSON sample above shows the right format/version, component count and a green valid badge (the 1.2 documents validate against the bundled 1.2 schema). XML samples parse with the right counts and the grey "not validated" badge.
2. **Invalid document:** `invalid-cdx.json` → red badge with a count; the Validation tab lists at least `/components/0/type` (enum), `/components/0/version` (type), `/components/1` (required name), `/components/2/hashes/0/content` (pattern), `/dependencies/0/dependsOn` (type), `/metadata/timestamp` (format), `/metadata/tools` (type); "Copy report" produces the same lines.
3. **Components table:** search `symfony` on laravel narrows the rows and the count; sort by name asc/desc and by version; click a row → details with hashes and copy buttons; `Export CSV` downloads `laravel-cdx-1.4.components.csv` whose row count equals the visible rows and whose header matches §4; `Copy PURLs` yields one purl per line.
4. **Licenses:** counts on laravel sum to the number of license entries; a component without licenses is counted as such; expressions from `big-10k` appear as-is.
5. **Dependencies:** laravel shows a tree rooted at its subject (dropwizard's subject ref never appears in `dependencies[]`, so its roots are the components nothing depends on — correct behaviour); `big-10k` warns about unresolved refs (the synthetic deps point at `@0.0.0` versions that do not exist) and Expand all is disabled above 2 000 nodes; a cycle does not hang.
6. **Vulnerabilities:** `vex-cdx.json` and `big-10k` list their entries with severity badges, links, and affected component names where resolvable.
7. **10k performance:** `big-10k-cdx.json` analyzes in the worker (report time; UI stays responsive — a tab click during analysis registers < 300 ms), the table scrolls smoothly (frame gaps during a programmatic scroll < 50 ms), search filters within a second, CSV export completes.
8. **Bad input:** truncated JSON → parser message; an XML with a syntax error → parsererror text; a JSON that is neither format → the explicit message; a `.txt` drop → toast.
9. **Privacy:** every request is a same-origin GET (app chunks + schema chunks + worker); nothing while a document is open except lazy chunks; no request body; nothing in IndexedDB/localStorage.
10. **Console/pageerror:** none. **Gates:** report numbers.

Visual (T3): 1280 and 390, light and dark: empty state; laravel loaded (summary + Components); Licenses; Dependencies (partly expanded); Validation tab with errors (invalid file); Vulnerabilities (vex). `scrollWidth <= viewport`; the table scrolls horizontally inside its own container on 390, never the page.

## 10. Definition of done

Gates green; every §9 check passes on a fresh production build (T4); PLAN.md Phase 55 needs no change unless a decision diverged (note: this handout extends schema coverage to CycloneDX 1.2–1.6 rather than 1.4–1.6 — update the plan line in the same commit).
