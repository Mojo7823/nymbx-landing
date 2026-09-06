# Phase 60 Handout — XLSX / CSV viewer: export

**Audience:** the agent implementing Phase 60 (T1) and the agents verifying it (T2–T4). Self-contained; read fully before writing code. [/PLAN.md](../../PLAN.md) (Phase 60, and Phase 21 for the tool being extended) and [/CLAUDE.md](../../CLAUDE.md) are authoritative if anything here seems ambiguous.

---

## 1. Goal

Extend the existing **XLSX / CSV viewer** (`/tools/xlsx-csv-viewer`, `src/tools/xlsx-csv-viewer/`, Phase 21) with **export**: the active sheet as **CSV** (delimiter option, RFC 4180 quoting, optional UTF-8 BOM for Excel) or **JSON** (array of objects keyed by the header row, or array of arrays), and **all sheets as a zip of CSVs**. Formula cells export their cached computed value; date cells export as **ISO 8601 strings**, never as serial numbers; fields with delimiters, quotes or newlines are quoted correctly; a 100k-row sheet exports inside the existing worker without freezing the page. Viewing behaviour is unchanged. No registry/route/registry-test changes (the tool is already `available`).

## 2. What exists today (read these first)

- `sheet.worker.ts` — keeps one `WorkBook` (`read(buffer, { dense: true })`); `open(buffer) → SheetMeta[]` (`name, rows, cols`); `getSheet(index) → string[][]` of `utils.format_cell(cell)` display text (formula cells format their cached `v`; SheetJS never re-evaluates). Dense mode: `sheet['!data'][r][c]` is a `CellObject | undefined`.
- `XlsxCsvViewer.tsx` — `file: { name, size, sheets }`, `active` sheet index, `rows: string[][]`, search (`filterIndices`), column sort (`sortIndices`) → `displayIndices: number[]` (sheet row indices in display order — **row 0 is not special: the header row is sorted/filtered like any other**), selection + copy as TSV, virtualised grid. The worker is created lazily via `wrapWorker` and terminated on unmount. Header row of controls: search input, status line, `Copy selection`.
- `gridMath.ts` — `colLabel(i)` (`A`, `B`, …, `AA`), `sortIndices`, `filterIndices`, `buildTsv`.
- Shared: `src/lib/download.ts` (`downloadBlob`, `createZip(files: { name, data: Uint8Array | string }[]) → Promise<Uint8Array>` on fflate — works in a worker), `src/lib/format.ts`, `src/lib/toast.ts`, `Button`, `ProgressBar`.
- A sibling tool `src/tools/csv-json/convert.ts` has its own CSV/JSON conversion for pasted text; do not import it (different data model), but its tests show the house style for quoting cases.

## 3. Sources of truth (verified 2026-09-06; SheetJS 0.20.3, context7 `/websites/sheetjs`; probe script `…/scratchpad/xlsx-assets/make-fixtures.mjs`)

- **Cell types**: `n` number (also dates and, in old files, booleans), `s` text, `b` boolean, `e` error (`v` numeric code, `w` the text like `#DIV/0!`), `d` Date object (only when read with `cellDates: true` — the viewer does not, keep it that way), `z` stub. Formula cells carry `f` plus the cached `v`/`w` — export `v`, never `f`.
- **Dates are numbers with a date format**: `XLSX.SSF.is_date(cell.z)` tells whether the number format is a date/time format (`'yyyy-mm-dd'` → true, `'"$"#,##0.00'` → false, `'m/d/yy h:mm'` → true). `XLSX.SSF.parse_date_code(v, { date1904 })` returns `{ y, m, d, H, M, S, T (seconds into the day), D (days) }`. The workbook's date system is `workbook.Workbook?.WBProps?.date1904 === true` (fixture `dates-1904.xlsx`: the same 2024-03-05 is serial 43894 there vs 45356 in a 1900-system file; SheetJS's own `format_cell` already shows the right text for both, and `parse_date_code` needs the flag). A bare serial **without** a date format (fixture cell `Data!E7` = 45356.5, `z` General) is a plain number and must export as `45356.5`.
- **SheetJS's own exporters are not enough**: `utils.sheet_to_csv` writes *formatted* text (`$1,234.50`, `3/5/24 10:15`), so dates follow the cell format, not ISO; `utils.sheet_to_json({ raw: true })` gives raw serials for dates. Hence a small exporter of our own over the dense data (§4). `sheet_to_csv`'s quoting rule (quote when the field contains the delimiter, a quote, or a newline; double embedded quotes) is the RFC 4180 rule we use.
- `!rows`/`!cols` `hidden` flags are only parsed with `cellStyles: true`, which the viewer does not pass; Excel's own "Save as CSV" exports hidden rows anyway. **Export everything in the sheet's `!ref` range; ignore hidden flags.** Trailing empty rows/columns beyond the last non-empty cell are not part of `!ref` and are not exported.
- Sheet names may contain characters that are illegal in file names (`"`, `<`, `>`, `&`, spaces; Excel itself forbids `: \ / ? * [ ]`). Fixture sheet: `Q3 Sales "east" & <west>`.
- Measured (Node 24): the 100k-row × 4-col fixture (6.7 MB xlsx) reads in ~1.5 s in `open()`; building a 3 MB CSV string from 400k cells is well under a second.

### 3.1 Fixtures — `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/xlsx-assets/`

| File | Contents |
|---|---|
| `mixed.xlsx` (20.5 KB) — *commit* to `src/tools/xlsx-csv-viewer/fixtures/` | Sheet **Data**, range A1:H7. Header `Name, Amount, Ratio, When, Stamp, Flag, Notes, Code`. Rows 2–6: text with commas/quotes (`Alice, "the" first`), CJK (`Chloé 名前`), a multi-line note (`line one\nline two`), a tab (`tab\there`), leading/trailing spaces (` leading and trailing `), text codes with leading zeros (`007`, `0042` — type `s`, must stay text), currency numbers (`"$"#,##0.00` → `1234.5`, `-42`, `0`, `1e6`), percentages (`0.0%` → `0.125`, `1`, `0.5`, `0.075`), **date-only** cells (`yyyy-mm-dd`: 2024-03-05, 1999-12-31, 2026-09-06, 1970-01-01), **datetime** cells (`m/d/yy h:mm`: 2024-03-05 10:15:30, 2000-01-01 00:00:00, 2026-09-06 23:59:59, 1970-01-01 12:00:00), booleans, a completely empty row 5. Row 7 = **formulas with cached values**: `A7 =CONCATENATE(A2,"|",A3)` → `Alice, "the" first|Bob`; `B7 =SUM(B2:B6)` → `1001192.5`; `C7 =1/0` → error `#DIV/0!`; `D7 =MAX(D2:D6)` → 2026-09-06 (date format); `E7` bare serial `45356.5` (no date format → number); `F7 =B2>B3` → `TRUE`; `G7` text ending in a newline. Sheet **Empty** (no cells). Sheet **`Q3 Sales "east" & <west>`** with 2 rows (`only,one` / `row,2`). |
| `dates-1904.xlsx` — *commit* | 1904 date system; `Dates1904!A2` = 2024-03-05 (`yyyy-mm-dd`) stored as serial 43894 |
| `big-100k.xlsx` (6.7 MB) — scratch only | Sheet **Big**: header `id, value, day, label` + 100,000 rows: `id` 1…100000, `value` `0.00`-formatted numbers, `day` dates (`yyyy-mm-dd`, serial 45000 + i % 365), `label` `row i` (every 7th `row i, "quoted"`) |
| `hazards.csv` — *commit* | 4 data rows: `comma, inside`, `quote ""inside""`, a multi-line field, an empty last field |
| `expected.json` | independent oracle built with **openpyxl** (`data_only=True`): every cell's typed value for `mixed.xlsx` and `dates-1904.xlsx` (dates already in the §4.1 ISO form), sheet names, `date1904`, and for `big-100k.xlsx` the row count and first/last data rows |

## 4. Behaviour specification

### 4.1 Cell → export value (`exportCell.ts`, pure, worker-side)

```ts
export type ExportValue = string | number | boolean | null
export function cellValue(cell: CellObject | undefined, opts: { date1904: boolean; values: 'typed' | 'display' }): ExportValue
export function isoDate(serial: number, format: string | undefined, date1904: boolean): string
```

- `values: 'display'` → `utils.format_cell(cell)` for every non-empty cell (exactly what the grid shows; dates keep the cell's format) — offered for users who want "what I see".
- `values: 'typed'` (default):
  - empty / stub → `null`
  - `t: 's'` → the string (leading zeros, spaces, newlines untouched)
  - `t: 'b'` → boolean
  - `t: 'e'` → the error text (`cell.w ?? '#ERROR'`), a string
  - `t: 'd'` → ISO from the Date (defensive; the viewer never sets `cellDates`)
  - `t: 'n'` with `SSF.is_date(cell.z)` → `isoDate(v, z, date1904)`; otherwise the number (JS number; `-0` → `0`; non-finite → `null`)
- `isoDate`: `parse_date_code(serial, { date1904 })` → parts. **Format-based shape** so a column stays uniform: strip quoted literals from the format string (`"…"`), then if it contains hour/second tokens or AM/PM (`/[hHsS]|AM\/PM|A\/P/`) → `YYYY-MM-DDTHH:MM:SS` (no zone — Excel times are naive; **seconds always written**, even when the format hides them); else if it contains no `y`/`d` tokens (time-only format) → `HH:MM:SS`; else `YYYY-MM-DD`. Sub-second fractions are dropped. Expected on the fixture: `D2` → `2024-03-05`, `E2` → `2024-03-05T10:15:30`, `E3` → `2000-01-01T00:00:00`, `D7` → `2026-09-06`, `E7` → `45356.5` (number), 1904 fixture `A2` → `2024-03-05`.

### 4.2 Table extraction (`exportSheet.ts`, pure, worker-side)

```ts
export interface ExportOptions {
  format: 'csv' | 'json-objects' | 'json-arrays'
  values: 'typed' | 'display'          // default typed
  delimiter: ',' | ';' | '\t' | '|'      // csv only, default ','
  quoteAll: boolean                     // csv only, default false
  bom: boolean                          // csv only, default true (Excel needs it to read UTF-8 accents/CJK)
  rowIndices?: number[]                 // "current view": sheet row indices in display order; undefined = whole sheet
}
export function extractTable(sheet: WorkSheet, date1904: boolean, opts): ExportValue[][]   // every row padded to the sheet width (from !ref); null for empty cells
export function toCsv(table: ExportValue[][], opts): string
export function toJson(table: ExportValue[][], mode: 'objects' | 'arrays'): string
export function headerKeys(headerRow: ExportValue[]): string[]
export function safeSheetFileName(name: string, taken: Set<string>): string
```

- **CSV** (`toCsv`): RFC 4180 — records joined by `\r\n`, a trailing `\r\n` after the last record; a field is quoted when it contains the delimiter, `"`, `\r` or `\n` (or always with `quoteAll`); embedded quotes doubled; `null` → empty field; numbers via `String(n)` (`1234.5`, `1000000`, `0.125`; never locale-formatted, never exponent for integers < 1e21); booleans `TRUE`/`FALSE` (Excel's convention); blank rows inside the range are kept as empty records (Excel does the same). With `bom`, the downloaded bytes start with `EF BB BF`.
- **JSON objects** (`toJson(…, 'objects')`): keys from the first row of the table via `headerKeys`: header cell text (`String(value).trim()`), empty header → the column letter (`colLabel(c)`, e.g. `H`), duplicate header → suffixed `Amount_2`, `Amount_3`. Rows that are entirely `null` are **skipped** in objects mode (an all-null object is noise); every object has every key (`null` for empty cells) so the shape is uniform. Output: `JSON.stringify(rows, null, 2)`.
- **JSON arrays**: `JSON.stringify(table, null, 2)` including the header row; blank rows kept as arrays of `null`.
- **Current view** (`rowIndices`): the table is exactly those sheet rows in that order (what the grid shows). In objects mode the header is **always sheet row 0** (even if the view sorted it elsewhere or filtered it out), followed by the view's rows minus row 0.
- `safeSheetFileName`: replace `[\\/:*?"<>|\x00-\x1f]` and `&` with `_`, collapse runs of `_`/spaces, trim, cap at 80 chars, empty → `Sheet`; if `taken` already has it (case-insensitive) append ` (2)`, ` (3)`… Fixture: `Q3 Sales "east" & <west>` → `Q3 Sales _east_ _ _west_.csv` after collapsing (exact expectation in a test).
- **All sheets as zip** (worker): one CSV per sheet using the same CSV options, whole sheets (no view), entries `<workbook stem>/<safe sheet name>.csv`, built with `createZip` from `src/lib/download.ts`; empty sheets produce an empty (or BOM-only) file — still included, so the archive mirrors the workbook.

### 4.3 Worker API (`sheet.worker.ts` additions)

```ts
exportSheet(index: number, opts: ExportOptions): Uint8Array      // transfer()ed; UTF-8 (+BOM for csv)
exportAllCsv(opts: Omit<ExportOptions, 'format' | 'rowIndices'>, stem: string): Uint8Array  // zip, transfer()ed
```

Both run entirely in the worker; the page turns the bytes into a `Blob` (`text/csv;charset=utf-8`, `application/json`, `application/zip`) and calls `downloadBlob`. File names: `<workbook stem> - <safe sheet name>.csv|.json`, zip `<workbook stem>-sheets.zip`, stem = file name without extension (for `hazards.csv` the single sheet is `Sheet1` → `hazards - Sheet1.csv`). Guard: a second export while one runs is queued behind the first (a `busy` state disables the button; no double downloads).

### 4.4 UX

An **Export** control on the toolbar row (next to `Copy selection`): a `Button` `Export…` that opens a small popover/panel (a `<details>`-style disclosure or an inline card under the toolbar — no new dependency): 

- `Format`: radio `CSV` (default) · `JSON — array of objects (header row = keys)` · `JSON — array of arrays`.
- `Rows`: radio `Whole sheet` (default) · `Current view — n rows (sorted / filtered as shown)` — the second option is disabled with a hint when there is no search and no sort.
- `Values`: radio `Typed (numbers, TRUE/FALSE, ISO dates)` (default) · `As displayed (formatted text)`.
- CSV only: `Delimiter` select `Comma (,)` / `Semicolon (;)` / `Tab` / `Pipe (|)`; checkbox `Quote every field`; checkbox `UTF-8 BOM (helps Excel read accents and CJK)` — default on.
- Buttons: `Download <sheet name>` (primary) · `All sheets as zip of CSVs` (secondary; hidden for single-sheet files). While exporting: `ProgressBar` indeterminate `Exporting…`; a toast on failure. A one-line note under the panel: `Formulas export their last computed value; dates as ISO 8601.`
- Mobile: the panel is full width; radios wrap.

Everything else (grid, search, sort, copy) untouched. No network at any point.

## 5. Code layout

```
src/tools/xlsx-csv-viewer/
  exportCell.ts / exportCell.test.ts     §4.1 (tests on hand-built CellObjects + the two committed workbooks read with `read(buffer, { dense: true })` in Vitest/Node)
  exportSheet.ts / exportSheet.test.ts   §4.2 (extractTable on mixed.xlsx: every value equals expected.json's; toCsv quoting matrix incl. delimiter/quote/CRLF/tab/leading spaces/`null`; quoteAll; JSON objects keys incl. empty/duplicate headers; blank-row rules; view mode header rule; safeSheetFileName cases; 1904)
  sheet.worker.ts                        §4.3
  ExportPanel.tsx                        §4.4
  XlsxCsvViewer.tsx                      wire the panel; pass `displayIndices` for view mode; download handling
  fixtures/mixed.xlsx, dates-1904.xlsx, hazards.csv
```

`xlsx` must stay imported only by the worker and the pure export modules (which only the worker and tests import) — the page chunk must not grow by SheetJS; the entry chunk (`dist/assets/index-*.js`) stays ≈ 265.9 kB.

## 6. Tasks (T1 — in order; `npm run lint` and `npm run typecheck` after each step; `npm run test` at the end)

1. Copy fixtures; `exportCell.ts` + tests (incl. `isoDate` rules and 1904).
2. `exportSheet.ts` + tests against `expected.json` (copy it next to the fixtures as `mixed.expected.json` if useful, or embed the expectations).
3. Worker methods; `ExportPanel.tsx`; wiring; `npm run build` (report entry, tool and worker chunk sizes; confirm `xlsx` markers such as `SheetJS` appear only in the worker chunk).
4. Manual smoke in `vite preview` (repo root; stop with `kill <pid>` from `ss -ltnp | grep 4173`, never `pkill -f`): `mixed.xlsx` → CSV and both JSONs → check against `expected.json` with Python's `csv`/`json` modules; `big-100k.xlsx` → CSV export timing and a `PerformanceObserver` longtask check (≤ 200 ms); zip of all sheets → `unzip -l` lists 3 entries with the sanitised name. Fix what you find. Do **not** commit; do not edit PLAN.md. Report files, gates, bundle sizes, smoke numbers and every judgement call.

## 7. Verification (T2/T3, by the verifier — read-only; `npm run build` + `npm run preview` on 127.0.0.1:4173, Python Playwright; parse downloads with Python `csv` (`newline=''`) and `json`)

T2:
- `mixed.xlsx` / **Data** → CSV (defaults): bytes start with `EF BB BF`; `csv.reader` yields 7 records × 8 fields; record 2 == `['Alice, "the" first', '1234.5', '0.125', '2024-03-05', '2024-03-05T10:15:30', 'TRUE', 'line one\nline two', '007']`; row 5 is 8 empty fields; row 7 == `['Alice, "the" first|Bob', '1001192.5', '#DIV/0!', '2026-09-06', '45356.5', 'TRUE', 'ends with newline\n', '']`; raw text contains `"Alice, ""the"" first"` and `"line one\r?\nline two"` quoted, `tab\there` unquoted, ` leading and trailing ` unquoted, records end with `\r\n`; no `SUM(`/`CONCATENATE` anywhere (formulas → values).
- Delimiter `;` → the `Alice, "the" first` field is still quoted (contains `"`), `1234.5` stays `1234.5` (no locale comma); Tab delimiter → the `tab\there` field is quoted; `Quote every field` → every field quoted incl. empties (`""`); BOM off → no BOM.
- JSON objects: **5** objects (6 data rows minus the blank row 5), keys exactly the header; object 1 == `{ Name: 'Alice, "the" first', Amount: 1234.5, Ratio: 0.125, When: '2024-03-05', Stamp: '2024-03-05T10:15:30', Flag: true, Notes: 'line one\nline two', Code: '007' }`; the last object has `Ratio: '#DIV/0!'`, `Stamp: 45356.5` (number), `Code: null`. JSON arrays: 7 arrays incl. header, row 5 all `null`.
- `As displayed`: CSV record 2 == `['Alice, "the" first', '$1,234.50', '12.5%', '2024-03-05', '3/5/24 10:15', 'TRUE', 'line one\nline two', '007']`.
- Current view: search `Bob` (matches rows 3 and 7) → CSV has exactly those 2 records in display order; sort by column B descending → objects export keeps the header keys and orders rows by Amount desc with the header not among the data.
- Sheet `Q3 Sales "east" & <west>` → CSV download named `mixed - Q3 Sales _east_ _ _west_.csv`; `Empty` sheet → a BOM-only/empty CSV without error; JSON arrays `[]` and objects `[]`.
- `All sheets as zip` → `mixed-sheets.zip` with entries `mixed/Data.csv`, `mixed/Empty.csv`, `mixed/Q3 Sales _east_ _ _west_.csv`; `Data.csv` equals the single-sheet export.
- `dates-1904.xlsx` → CSV record 2 == `['2024-03-05']`.
- `hazards.csv` (a CSV opened in the viewer) → CSV round-trip: fields equal the input's parsed fields; JSON objects has 4 objects with `when: null` in the last.
- `big-100k.xlsx` → CSV: 100,001 records, last == `expected.json.lastRow` (day as ISO), every 7th label quoted; export completes < 5 s after clicking; **no main-thread long task > 200 ms** during export (`PerformanceObserver` longtask); JSON objects export also completes (< 8 s) and parses to 100,000 objects.
- Regression: viewing, search, sort, copy selection unchanged (copy a 2×2 block → TSV in the clipboard as before).
- Privacy: only same-origin GETs; console clean; fixtures on disk unchanged (sha256).

T3: 1280×800 and 390×844, light and dark: export panel open on `mixed.xlsx` (CSV options visible), JSON mode selected, exporting state if catchable, and the grid unchanged. No horizontal overflow at 390; focus rings; radios reachable by keyboard.

## 8. Definition of done

- Gates green; new suites in `npm run test`; entry chunk unchanged; `xlsx` only in the worker chunk.
- T2 all PASS (or fixed by the orchestrator and re-run); T3/T4 screenshots reviewed.
- PLAN.md Phase 60 gets an implementation note; commit subject `feat: export sheets as CSV / JSON / zip from the XLSX viewer (Phase 60)`.

---

## 9. Implementation notes (post-T1/T2, 2026-09-06)

1. **`read(buffer, { dense: true, cellNF: true })`** — SheetJS only fills `cell.z` (the number format) with `cellNF`; without it every date would have exported as a serial. Read time on the 6.7 MB fixture: 1.15 s → 1.27 s. The grid's `format_cell` text is unaffected.
2. **`exportOptions.ts`** holds the SheetJS-free option types, `defaultExportOptions`, `safeSheetFileName` and `fileStem`; `exportSheet.ts` re-exports them. This keeps the page chunk (13.7 kB) free of SheetJS, which lives only in the 383 kB worker chunk.
3. `isoDate` checks for a time-only format (no `y`/`d` tokens → `HH:MM:SS`) before the hour/second test, otherwise `h:mm:ss` formats would never reach that branch. Builtin numeric format ids are resolved through `SSF.get_table()`.
4. Empty-string text cells (`{ t: 's', v: '' }`, which dense mode keeps for blank rows) map to `null`, so all-blank rows are skipped in objects mode as specified.
5. A second export click while one is running is ignored (buttons disabled) rather than queued.
6. Embedded newlines inside quoted fields are written verbatim (LF) while record separators are CRLF; `1e21` exports as `1e+21` (in spec — only integers below 1e21 avoid exponents).
7. "Current view" reproduces the grid order exactly; note the grid's column sort (Phase 21) compares *displayed* text, so a currency column like `$1,234.50` sorts lexically, not numerically.
8. T2 reported an invisible focus ring on primary buttons; re-measured: `Button` carries `transition-colors`, whose transition list includes `outline-color`, so the ring fades from `currentColor` to pine over 150 ms — at t=0 the computed colour is white, at 400 ms it is `rgb(51, 160, 111)`. A measurement artefact, not a defect; nothing to fix.
