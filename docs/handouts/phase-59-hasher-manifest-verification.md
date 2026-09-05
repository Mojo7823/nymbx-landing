# Phase 59 Handout — Bulk file hasher: checksum manifest verification

**Audience:** the agent implementing Phase 59 (T1) and the agents verifying it (T2–T4). Self-contained; read fully before writing code. [/PLAN.md](../../PLAN.md) (Phase 59, and Phase 9 for the tool being extended) and [/CLAUDE.md](../../CLAUDE.md) are authoritative if anything here seems ambiguous.

---

## 1. Goal

Extend the existing **Bulk file hasher** (`/tools/bulk-file-hasher`, `src/tools/bulk-file-hasher/`, Phase 9) so it can **verify files against a checksum manifest**: drop a `SHA256SUMS` / `*.sha256` / `*.md5` / `*.sha1` / `*.sha512` / BSD-tag (`SHA256 (file) = …`) / OpenSSL (`SHA2-256(file)= …`) file — or paste its text — alongside the files (or a whole folder); the algorithm is selected automatically; every manifest entry and every dropped file gets a status **PASS / FAIL / MISSING / EXTRA**, with summary counters and an exportable report. Nothing else about the tool changes: the plain hashing mode, the single "expected hash" field, CSV/TXT export and the streaming worker stay as they are. No new registry entry (the tool is already `available`); `src/lib/registry.test.ts` is untouched.

## 2. What exists today (read these files first)

- `hashEngine.ts` — `AlgorithmId = 'sha256' | 'sha1' | 'sha512' | 'md5' | 'crc32'`, `hashBlob(blob, algorithms, onProgress)` streams 8 MiB chunks through hash-wasm hashers (`createSHA256`, …). Tests pin the published vectors for the empty input and `"abc"`.
- `hash.worker.ts` — Comlink `hashFile(file, algorithms, onProgress)`; the page keeps one worker.
- `hashLogic.ts` — `algorithmLabels`, `algorithmOrder`, `HashRow`, `normalizeExpected`, `buildCsv`, `buildTxt` (+ tests).
- `BulkFileHasher.tsx` — `FileItem { id, file, status: 'queued'|'hashing'|'done'|'error', bytesDone, hashes, error }`; algorithm checkboxes (`enabled`), the single `expected` hash field, a sequential hashing loop driven by an effect (reads `itemsRef`/`enabledRef`, computes only the algorithms a file is still missing — reuse it unchanged: a manifest only changes *which* algorithms are enabled), the file list with per-hash copy buttons, "Add more" (plain `<input type=file multiple>`), Clear all, Export CSV/TXT.
- `src/components/FileDropzone.tsx` — has `folders` + `onPaths(files: DroppedPath[])` (paths relative to the drop, e.g. `release/bin/tool.wasm`, from `src/lib/dropFiles.ts`; plain files report `file.name`); `inputFilePath(file)` reads `webkitRelativePath` from a `webkitdirectory` input.
- Shared: `src/lib/download.ts` (`downloadBlob`), `src/lib/format.ts` (`formatBytes`), `src/lib/toast.ts`, `src/components/CopyButton.tsx`, `ProgressBar`, `Button`.

## 3. Sources of truth (verified 2026-09-05)

### 3.1 Manifest formats (GNU coreutils manual via context7 `/websites/gnu_software_coreutils_manual`; fixtures generated locally with `sha256sum`, `md5sum`, `sha1sum`, `sha512sum`, `b2sum`, `openssl dgst`)

- **GNU untagged** (`md5sum`, `sha1sum`, `sha256sum`, `sha512sum`, `b2sum`, `cksum -a`): `<hex><space><flag><name>` where `flag` is a space (text mode) or `*` (binary mode, `-b`; the default on Windows). Example: `9c85…297f  bin/tool.wasm` and `9c85…297f *bin/tool.wasm`. The two are equivalent for verification — strip the flag, remember `binary: true` for display only.
- **Escaped names**: if the file name contains a backslash, newline (or CR in newer coreutils), the **line starts with `\`** and inside the name `\` → `\\`, newline → `\n`, CR → `\r`. Example from the fixture: `\36e4…964b  docs/back\\slash.txt` names the file `docs/back\slash.txt`. Unescape only when the line starts with `\`; otherwise a backslash in the name is literal.
- **BSD / GNU `--tag`** (`md5 -r`? no — `md5 file`, `shasum --tag`, `sha256sum --tag`, `b2sum --tag`, macOS `shasum -a 256`): `<ALG> (<name>) = <hex>` — e.g. `SHA256 (docs/sub dir/data with spaces.csv) = 2d3c…d7ad`, `BLAKE2b (README.md) = 9f81…e334`. Tags seen in the wild: `MD5`, `SHA1`, `SHA224`, `SHA256`, `SHA384`, `SHA512`, `SHA512/256`, `SHA3-256`, `BLAKE2b`, `BLAKE2s`, `BLAKE3`, `CRC32`. The name may contain `)`; split on the **last** ` ) = ` (regex `^([A-Za-z0-9/_-]+) \((.*)\) = ([0-9a-fA-F]+)$`).
- **OpenSSL** (`openssl dgst -sha256`): `SHA2-256(README.md)= 6847…7a67` — no space before `(`, `)= ` after; OpenSSL 1.x prints `SHA256(name)= hex`. Regex `^([A-Za-z0-9-]+)\((.*)\)= ([0-9a-fA-F]+)$`. Tag normalisation: `SHA2-256`→sha256, `SHA2-512`→sha512, `SHA2-384`→sha384, `SHA1`/`SHA-1`→sha1, `MD5`→md5, `BLAKE2B512`/`BLAKE2b`→blake2b.
- **Comments and blanks**: lines starting with `#` and empty lines are ignored (GNU `--check` skips them); CRLF line endings must be tolerated (`with-missing.sha256` fixture has CRLF, a comment and a blank line). Anything else that does not parse is reported as a warning `Line N: not a checksum line` — never a hard error (GNU prints "N lines are improperly formatted" and continues). Leading `./` on names is stripped for matching (`sha256sum ./x` writes `./x`).
- Digests are hex, case-insensitive; compare lowercase. Digest length → algorithm when no tag: 8 → crc32, 32 → md5, 40 → sha1, 56 → sha224 (unsupported), 64 → sha256, 96 → sha384, 128 → sha512 (BLAKE2b-512 also has 128 — only a tag or a `.b2` file name selects blake2b). Manifest **file name** hints, checked first: `MD5SUMS`/`*.md5` → md5; `SHA1SUMS`/`*.sha1` → sha1; `SHA256SUMS`/`*.sha256`/`SHA256SUMS.txt` → sha256; `SHA384SUMS`/`*.sha384` → sha384; `SHA512SUMS`/`*.sha512` → sha512; `B2SUMS`/`*.b2`/`*.blake2` → blake2b; `CHECKSUMS`/`*.sum(s)`/`*.checksum(s)`/`*.hash(es)`/`*.digest(s)` → by digest length. A tag on the line always wins over the file name; a file-name hint wins over the digest length.
- GNU `sha256sum -c` semantics worth mirroring: each entry is independent; the exit summary counts "did NOT match" and "could not be read" (our MISSING); `--ignore-missing` exists because MISSING is a normal situation when only some files were downloaded.

### 3.2 hash-wasm 4.12 (context7 `/daninet/hash-wasm`)

Modular factories, each a separate small WASM: `createMD5`, `createSHA1`, `createSHA256`, `createSHA384`, `createSHA512`, `createBLAKE2b(bits = 512)`, `createCRC32`, `createSHA3(bits)`, `createBLAKE3`, … `IHasher.init().update(data).digest('hex')`. Add **`sha384`** and **`blake2b`** (BLAKE2b-512, what `b2sum` prints) to `AlgorithmId`, `factories`, `algorithmLabels` (`SHA-384`, `BLAKE2b`) and `algorithmOrder` (`sha256, sha1, sha512, sha384, md5, blake2b, crc32`); both default off in the checkboxes. Test vectors (from local coreutils `sha384sum` / `b2sum`, verified):

| input | SHA-384 | BLAKE2b-512 |
|---|---|---|
| empty | `38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b` | `786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce` |
| `abc` | `cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7` | `ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923` |

Tags for algorithms we do not compute (`SHA224`, `SHA3-*`, `BLAKE2s`, `BLAKE3`, `SHA512/256`, `CRC64`, `XXH*`) parse into entries with `algorithm: null` and status **UNSUPPORTED** (shown, never hashed); if *every* entry is unsupported, the manifest card says so.

### 3.3 Fixtures — `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/hasher-assets/`

`release/` is a folder as a user would drop it; every manifest inside was written **from inside `release/`** so entry paths are relative to that folder:

| Path | Notes |
|---|---|
| `README.md` (64 B), `bin/tool.wasm` (300,000 B random), `bin/tool.js` (65,536 B random), `empty.txt` (0 B), `docs/sub dir/data with spaces.csv`, `docs/名前 é.txt`, `docs/back\slash.txt` (literal backslash in the name) | payload |
| `SHA256SUMS` | GNU text mode, all 7 payload files; the last line is the **escaped** form `\36e4…  docs/back\\slash.txt` |
| `SHA256SUMS.binary` | GNU binary mode (`*`), README + tool.wasm |
| `SHA256SUMS.bsd` | `sha256sum --tag`: README, tool.wasm, the spaces file |
| `MD5SUMS`, `checksums.sha1`, `release.sha512` | README + tool.js (md5, sha1) / README + tool.wasm (sha512) |
| `README.b2` | `b2sum --tag`: `BLAKE2b (README.md) = …` |
| `openssl.sha256` | `openssl dgst -sha256`: `SHA2-256(README.md)= …`, `SHA2-256(bin/tool.js)= …` |
| `with-missing.sha256` | CRLF, `# generated by build 42` comment, a blank line, README (present) and `bin/not-shipped.bin` (**absent** → MISSING) |
| `corrupted/` | `README.md`, `SHA256SUMS` (same as above) and `bin/tool.js` with **byte 1000 XOR 0x01** — its SHA-256 is `7418e9bb3e84e85d5d9953fbb97e7a543c3ac1777c91905c48e8b334f33d9e25` vs the manifest's `8a47ec83fae5a3c39befa28b3c9bfd700b01cdddf73bfacdd01ba3cce55ac803` → FAIL |
| `expected.json` | every payload file's size and sha256/sha1/md5/sha512/blake2b, and every manifest's text |

Commit the small manifests (`SHA256SUMS`, `SHA256SUMS.binary`, `SHA256SUMS.bsd`, `MD5SUMS`, `README.b2`, `openssl.sha256`, `with-missing.sha256`) into `src/tools/bulk-file-hasher/fixtures/` for the parser tests (they are text; add the directory to `.prettierignore`). Do not commit the binaries. Note: the machine's `sha256sum` is uutils 0.8.0 and *fails to read back its own escaped line* — a uutils bug; GNU coreutils and our parser handle it.

## 4. Behaviour specification

### 4.1 `manifest.ts` (pure)

```ts
export interface ManifestEntry {
  path: string                 // unescaped, `./` stripped, as written (separators untouched)
  digest: string               // lowercase hex
  algorithm: AlgorithmId | null  // null = unsupported tag (kept for display)
  tag?: string                 // the literal tag when the line had one (BSD/OpenSSL)
  binary: boolean              // `*` flag
  line: number                 // 1-based, for warnings
}
export interface Manifest {
  name: string                 // file name or 'pasted text'
  entries: ManifestEntry[]
  algorithms: AlgorithmId[]    // distinct, in algorithmOrder
  format: 'gnu' | 'bsd' | 'openssl' | 'mixed'
  warnings: string[]           // `Line 4: not a checksum line`, `Line 9: duplicate entry for bin/tool.js (first one kept)`
}
export function parseManifest(text: string, name?: string): Manifest
export function looksLikeManifestName(name: string): boolean   // §3.1 file-name patterns
export function algorithmForDigest(hexLength: number): AlgorithmId | null
export function algorithmForTag(tag: string): AlgorithmId | null
export function algorithmForName(name: string): AlgorithmId | null
```

Rules: split on `\r?\n`; trim trailing CR; skip blank and `#` lines; try BSD, then OpenSSL, then GNU (`^\\?([0-9a-fA-F]{8,128})[ \t]+([ *]?)(.*)$` — note GNU allows exactly one separator char plus the flag; be lenient: one or more spaces/tabs, optional `*`); unescape when the line starts with `\`; strip a leading `./`; lowercase the digest; algorithm = tag → name hint → digest length; duplicate paths → keep the first, warn. `format` = the single kind seen or `mixed`. An input with zero entries returns `entries: []` and the UI says "No checksum lines found".

### 4.2 `verify.ts` (pure)

```ts
export type VerifyStatus = 'pass' | 'fail' | 'missing' | 'extra' | 'pending' | 'unsupported' | 'error'
export interface VerifyRow {
  status: VerifyStatus
  path: string                 // manifest path for entries, dropped path for extras
  entry?: ManifestEntry
  fileId?: number              // the matched FileItem
  actual?: string              // computed digest (fail/pass)
  matchedBy?: 'path' | 'name' | 'case' | 'separators'   // how the file was found; undefined for exact
  note?: string
}
export interface VerifySummary { pass: number; fail: number; missing: number; extra: number; pending: number; unsupported: number; error: number; total: number }
export function relativeToManifest(filePath: string, manifestPath: string | null): string
export function matchFiles(entries: ManifestEntry[], files: { id: number; path: string }[]): Map<number /* entry index */, { id: number; matchedBy?: VerifyRow['matchedBy'] }>
export function buildRows(manifest: Manifest, files: FileLike[], hashes: (id) => Partial<Record<AlgorithmId,string>>, status: (id) => FileItem['status']): VerifyRow[]
export function summarize(rows: VerifyRow[]): VerifySummary
```

Matching, in order, each pass only over still-unmatched entries/files, all paths NFC-normalised and `./`-stripped: (1) exact path equality after `relativeToManifest` (when the manifest was dropped inside a folder at `release/SHA256SUMS`, a file at `release/bin/tool.wasm` is `bin/tool.wasm`); (2) equality after replacing `\` with `/` on both sides (`matchedBy: 'separators'`); (3) case-insensitive equality (`'case'`); (4) **basename** equality when the basename is unique among the remaining entries *and* the remaining files (`'name'`, note `matched by file name — the manifest says bin/tool.js`). Files that are manifests themselves (the active one, and any other file whose name `looksLikeManifestName` and parses to ≥ 1 entry) are never EXTRA. Status: matched + hash computed → `pass`/`fail` (compare `hashes[entry.algorithm]`, lowercase); matched, not yet hashed → `pending`; matched, file `error` → `error`; unmatched entry → `missing`; unmatched file → `extra`; `algorithm === null` → `unsupported`. Row order: manifest order first, then extras in drop order.

### 4.3 Reports (`hashLogic.ts` additions)

- `buildVerifyTxt(rows, summary, manifest)` — `sha256sum -c` style: one line per row `README.md: OK` / `bin/tool.js: FAILED` / `bin/not-shipped.bin: MISSING` / `extra.txt: EXTRA (not in manifest)` / `x: UNSUPPORTED (SHA3-256)`, then a blank line and `# 5 OK · 1 FAILED · 1 MISSING · 1 EXTRA — manifest SHA256SUMS (SHA-256), verified in the browser on 2025-…` (ISO date only).
- `buildVerifyCsv(rows)` — header `Status,Path,Algorithm,Expected,Actual,Size (bytes),Note`, CRLF, quoting as in `buildCsv`.
- `buildVerifyJson(rows, summary, manifest)` — `{ manifest: { name, format, algorithms }, summary, rows: [{ status, path, algorithm, expected, actual, size, matchedBy, note }] }` pretty-printed.

Export file names: `verify-report.txt` / `.csv` / `.json`.

### 4.4 Page changes (`BulkFileHasher.tsx`)

- `FileItem` gains `path: string` (relative path from `onPaths`/`inputFilePath`, else `file.name`).
- New state: `manifest: Manifest | null`, `manifestPath: string | null` (its dropped path, for `relativeToManifest`), `manifestFileId?: number` (when it came from the drop, so it is excluded from hashing and from EXTRA), `pasteOpen: boolean`.
- **Auto-adoption**: whenever files are added, if no manifest is active and exactly one added file `looksLikeManifestName` and is ≤ 2 MB and parses to ≥ 1 entry → adopt it (toast `Using SHA256SUMS as the manifest`), do not hash it. If several candidates are added at once → adopt none, show the candidates in the manifest card as buttons ("Use SHA256SUMS", "Use MD5SUMS").
- **Enabling algorithms**: on adoption, `enabled[a] = true` for each `manifest.algorithms` entry (never disable anything). If the user unticks a needed algorithm, the manifest card shows `SHA-256 is needed for this manifest` with a one-click "Enable".
- When the manifest's algorithm is unsupported everywhere → card says `This manifest uses SHA3-256, which this tool cannot compute` and the table shows UNSUPPORTED rows.

### 4.5 UX

Settings card (existing) gains a **Manifest** block under the algorithm checkboxes:

- No manifest: `Verify against a manifest` — small dropzone-like button row: `Choose checksum file` (input accept `.sha256,.sha512,.sha384,.sha1,.md5,.b2,.txt,.sum,.sums,.asc?` — no `.asc`; just accept anything, we parse) · `Paste manifest` (toggles a textarea, mono, 5 rows, placeholder `9c85…  bin/tool.wasm  — or —  SHA256 (bin/tool.wasm) = 9c85…`; parsed on change, debounced 200 ms) · hint text `SHA256SUMS, *.sha256, *.md5, *.sha1, BSD "SHA256 (file) = …" and OpenSSL styles. Dropping a checksum file together with your files also works.` The existing single "Verify against" hash input stays visible in this state.
- Manifest active: a card `Manifest: SHA256SUMS · GNU · SHA-256 · 7 entries` (+ `2 warnings` expandable list) with `Remove manifest`; the single-hash input is hidden (it has no meaning while a manifest drives the comparison).
- **Verification table** replaces the plain per-file list while a manifest is active (the plain list returns when the manifest is removed; hashes already computed are kept): columns **Status** (chip: PASS pine · FAIL red · MISSING amber · EXTRA muted · PENDING with a mini progress when hashing · UNSUPPORTED muted · ERROR red), **Path** (manifest path in mono; for `matchedBy` ≠ exact a second muted line `matched by file name: <dropped path>`; extras show the dropped path), **Expected** and **Actual** digests (mono, `break-all`; FAIL shows both with the actual in red and a `Copy` button; PASS shows the digest once with ✓; MISSING shows expected only), **Size**. Above the table: **summary counters** as chips (`5 passed`, `1 failed`, `1 missing`, `2 extra`, `unsupported n`) and a **verdict banner** once nothing is pending: all pass → pine `All 7 files verified against SHA256SUMS`; any fail/error → red `1 file FAILED verification`; only missing/extra → amber `5 verified · 1 missing from the drop · 2 not in the manifest`. Row filter buttons `All · Problems only` (fail+missing+error) — default `All`.
- Folder input: the "Add more" row gets `Add folder` (hidden `<input type="file" webkitdirectory>` → `inputFilePath`), and the initial `FileDropzone` gets `folders` + `onPaths`. Paths are shown relative to the drop.
- Actions: `Export report` split into `TXT` (default, `sha256sum -c` style) · `CSV` · `JSON` buttons; enabled once nothing is pending. Existing CSV/TXT hash exports stay.
- Keep every existing behaviour and test green; mobile (390 px): the table becomes stacked cards (status chip + path + digests wrapping).

## 5. Code layout

```
src/tools/bulk-file-hasher/
  manifest.ts / manifest.test.ts      §4.1 — parse each committed fixture; escaped name; BSD; OpenSSL; CRLF+comment+blank; duplicates; unsupported tags; name/tag/length precedence
  verify.ts / verify.test.ts          §4.2 — matching passes incl. relativeToManifest, unique-basename fallback, manifest files never EXTRA; statuses; summary
  hashLogic.ts (+tests)               §4.3 report builders
  hashEngine.ts (+tests)              sha384 + blake2b with the §3.2 vectors
  BulkFileHasher.tsx                  §4.4/§4.5 (split the verification table into VerifyTable.tsx and the manifest block into ManifestCard.tsx)
  fixtures/                           the seven committed manifests
```

## 6. Tasks (T1 — in order; `npm run lint` and `npm run typecheck` after each step; `npm run test` at the end)

1. `hashEngine.ts` sha384/blake2b + vectors; `hashLogic.ts` labels/order.
2. `manifest.ts` + tests on the committed fixtures.
3. `verify.ts` + tests; report builders + tests.
4. UI (§4.4, §4.5). `npm run build`: record the entry chunk (≈ 265.9 kB), the tool chunk and the hash worker chunk sizes (the worker grows by the two WASM modules — say by how much).
5. Manual smoke in `vite preview` (from the repo root; stop with `kill <pid>` from `ss -ltnp | grep 4173`, never `pkill -f`): use the `Add folder` input with `hasher-assets/release` (Playwright `set_input_files` accepts a directory for `webkitdirectory` inputs) → SHA256SUMS auto-adopted → 7 PASS, the other manifests not EXTRA; `corrupted/` → `bin/tool.js` FAIL with both digests; paste `with-missing.sha256` → MISSING row. Fix what you find. Do **not** commit; do not edit PLAN.md. Report files, gates, bundle sizes, smoke results and every judgement call.

## 7. Verification (T2/T3, by the verifier — read-only; `npm run build` + `npm run preview` on 127.0.0.1:4173, Python Playwright; `expected.json` has every digest)

T2:
- Folder `release/` via `Add folder`: `SHA256SUMS` auto-adopted (toast + card `GNU · SHA-256 · 7 entries`, 0 warnings); table shows **7 PASS** including `docs/sub dir/data with spaces.csv`, `docs/名前 é.txt`, `docs/back\slash.txt` (escaped line) and `empty.txt`; none of the 8 other manifest files is EXTRA; verdict `All 7 files verified against SHA256SUMS`; actual digests equal `expected.json`.
- Remove manifest → choose `SHA256SUMS.binary` → 2 PASS (binary `*` marker), 5 EXTRA (payload not listed), verdict amber; `SHA256SUMS.bsd` → 3 PASS; `README.b2` → BLAKE2b auto-enabled, 1 PASS, actual = `expected.json` blake2b; `openssl.sha256` → 2 PASS; `MD5SUMS` → MD5 auto-enabled, 2 PASS; `checksums.sha1` → 2 PASS; `release.sha512` → 2 PASS.
- Paste mode: paste the text of `with-missing.sha256` → 2 entries, 0 warnings (comment/blank/CRLF ignored), `README.md` PASS, `bin/not-shipped.bin` **MISSING** (expected digest shown), verdict amber with `1 missing`.
- Files dropped individually (no folder): `bin/tool.wasm` + `README.md` + `SHA256SUMS` as three plain files → `bin/tool.wasm` **PASS via basename fallback** with the `matched by file name` note, `README.md` PASS by exact path (its manifest path has no directory); the 5 other entries MISSING.
- `corrupted/` folder → `bin/tool.js` **FAIL**, expected `8a47…c803` and actual `7418…9e25` both shown, verdict red `1 file FAILED verification`; `README.md` PASS.
- An extra file (`enc-assets/ascii.txt`) added → EXTRA row; `Problems only` filter hides PASS/EXTRA? (spec: Problems = fail+missing+error) — check it hides PASS and EXTRA and shows FAIL/MISSING.
- Manifest with an unsupported tag (paste `SHA3-256 (README.md) = ` + 64 hex) → UNSUPPORTED row and card note; no crash.
- Unticking SHA-256 while a SHA-256 manifest is active → card warning + `Enable` restores it.
- Exports: TXT has `bin/tool.js: FAILED` / `README.md: OK` lines and the summary comment; CSV header exact; JSON parses and `summary` counts match the chips. Existing hash CSV/TXT exports still work with no manifest.
- Plain mode regression: without a manifest, hashing + the single expected-hash field behave as before (`sha256sum` line pasted → ✓ Matches).
- Privacy: only same-origin GETs; console clean; all inputs on disk unchanged (sha256 of the fixtures).
- Performance: `bin/tool.wasm` (300 KB) + 7 files verify in < 3 s; no long task > 200 ms.

T3: 1280×800 and 390×844, light and dark: manifest card + table with all PASS; table with FAIL/MISSING/EXTRA; paste mode open; the plain mode (no manifest) for regression. No horizontal overflow at 390; digests wrap (`break-all`); chip contrast (report the known light-theme chip debt, don't fail on it); focus rings.

## 8. Definition of done

- All gates green; new suites in `npm run test`; entry chunk unchanged; the worker chunk growth reported.
- T2 all PASS (or fixed by the orchestrator and re-run); T3/T4 screenshots reviewed.
- PLAN.md Phase 59 gets an implementation note; commit subject `feat: verify files against checksum manifests in the bulk hasher (Phase 59)`.

---

## 9. Implementation notes (post-T1/T2, 2026-09-05)

1. **Auto-adoption with several checksum files** (§4.4 said "adopt none"): `preferredManifest()` adopts the canonically named one (`SHA256SUMS`, `MD5SUMS`, …, tie-broken by `algorithmOrder`); only when no candidate is canonical and more than one exists does the card offer "Use …" buttons. `looksLikeManifestName` also strips one trailing extension so `SHA256SUMS.bsd` / `.binary` are recognised and never EXTRA.
2. **`commonRoot`**: a manifest chosen with the file input has no dropped path, so entries resolve against the single top-level folder the dropped files share.
3. Chromium reports a file literally named `back\slash.txt` with `webkitRelativePath` `docs/back/slash.txt`, so the escaped GNU line matches through the *separators* pass (the row shows `matched ignoring path separators`). The parser handles the escape correctly; the note is honest about how the file was found.
4. The paste box is debounced by a timer armed in the change handler (no effect depends on the handlers, no lint rule silenced). Rows with a dropped file carry a remove (`×`) control in verification mode too (T2 finding).
5. `hash.worker` grew from 55.4 kB to 66.2 kB (SHA-384 + BLAKE2b WASM); the entry chunk is unchanged.
