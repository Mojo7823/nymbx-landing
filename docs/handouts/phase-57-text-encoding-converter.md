# Phase 57 Handout — Text encoding converter

**Audience:** the agent implementing Phase 57 (T1) and the agents verifying it (T2–T4). Self-contained; read fully before writing code. [/PLAN.md](../../PLAN.md) (Phase 57) and [/CLAUDE.md](../../CLAUDE.md) are authoritative if anything here seems ambiguous.

---

## 1. Goal

Add **Text encoding converter** at `/tools/text-encoding-converter` (`src/tools/text-encoding-converter/`): drop a text file in a legacy encoding (Big5, GBK / GB18030, Shift_JIS, EUC-JP, EUC-KR, Windows-125x, ISO-8859-x, KOI8-R, UTF-16 LE/BE, …) → ranked **auto-detection candidates** with side-by-side previews → pick the source encoding → download as **UTF-8** (BOM toggle, optional line-ending normalisation). A second mode **repairs mojibake**: paste garbled text ("this UTF-8 text was decoded as Big5"), choose or auto-detect the wrong/right pair, get the original back. Everything runs in a Web Worker; no user bytes leave the browser; nothing is persisted.

Registry entry exists (`slug: 'text-encoding-converter'`, `phase: 57`, `status: soon`, icon `Languages`, description `'Big5, GBK, Shift_JIS, UTF-16 → UTF-8'`). Flip it to `'available'`, add the lazy route in `src/tools/routes.ts`, and insert `'text-encoding-converter'` into the "available" list in `src/lib/registry.test.ts` **in registry order** (after `'string-escape'`, before `'text-hasher'`).

## 2. Sources of truth (verified 2026-09-05)

### 2.1 WHATWG Encoding Standard (context7 `/websites/encoding_spec_whatwg`; confirmed in Node 24.18 / ICU 78)

- `new TextDecoder(label, { fatal = false, ignoreBOM = false })`; `decoder.decode(bytes, { stream = false })`. `fatal: true` throws a `TypeError` on any malformed sequence. With `ignoreBOM: false` (default) a leading BOM of utf-8 / utf-16le / utf-16be is **consumed** (not emitted); set `ignoreBOM: true` if you need to see it. `stream: true` keeps an incomplete trailing sequence pending instead of erroring — verified: truncating a Big5 sample mid-character throws with `stream: false` and succeeds with `stream: true`. Use a **fresh decoder per candidate** when streaming.
- `TextEncoder` encodes **UTF-8 only**. There is no native encoder for legacy encodings — see §5 for how we build one from the decoder.
- `decoder.encoding` returns the canonical name. Label aliasing you must expect: `iso-8859-1`, `latin1`, `ascii`, `us-ascii`, `cp1252` → **windows-1252**; `iso-8859-9`, `latin5` → **windows-1254**; `gb2312`, `gbk`, `cp936`, `x-gbk` → **gbk** (whose *decoder* is the gb18030 decoder — both decode byte 0x80 as `€`); `utf-16`, `ucs-2` → **utf-16le**; `shift-jis`, `sjis`, `ms932`, `windows-31j` → **shift_jis**; `korean`, `cp949`, `ks_c_5601-1987` → **euc-kr**; `iso-8859-8-i` is distinct from `iso-8859-8`.
- **Unsupported labels throw `RangeError`**: the "replacement" family (`hz-gb-2312`, `iso-2022-cn`, `iso-2022-cn-ext`, `iso-2022-kr`), `utf-32`, and `replacement` itself. `x-user-defined` exists but maps 0x80–0xFF to U+F780–U+F7FF — exclude it from the candidate list.
- Multi-byte structure (needed by the reverse-table builder in §5):
  - **Big5**: lead 0x81–0xFE, trail 0x40–0x7E or 0xA1–0xFE. Leads 0x81–0xA0 are the HKSCS area (rare). Some spec pointers (0x8862, 0x8864, 0x88A3, 0x88A5) decode to **two** code points — reverse-table keys may therefore be 2-code-point strings. Duplicate code points inside the standard area (verified): 十 U+5341 at A2CC/A451, 卅 U+5345 at A2CE/A4CA, ═ U+2550 at A2A4/F9F9, ╞ U+255E at A2A5/F9E9, ╡ U+2561 at A2A7/F9EB, ╪ U+256A at A2A6/F9EA, ╭╮╰╯ U+256D/256E/2570/256F at A27E–A2A3 vs F9FA–F9FD.
  - **gb18030** (also used for the `gbk` label): two-byte lead 0x81–0xFE, trail 0x40–0x7E or 0x80–0xFE; four-byte lead 0x81–0xFE, 0x30–0x39, 0x81–0xFE, 0x30–0x39 (covers all of Unicode). Single byte 0x80 decodes to `€`; the spec's **gb18030 encoder** writes `€` as A2E3 and only the *gbk* encoder uses 0x80.
  - **Shift_JIS**: single bytes 0xA1–0xDF are half-width katakana (U+FF61–FF9F), 0x80 → U+0080, 0xA0 → U+F8F0; lead 0x81–0x9F or 0xE0–0xFC, trail 0x40–0x7E or 0x80–0xFC. Leads 0xED–0xEE (NEC-selected IBM extensions, spec pointers 8272–8835) duplicate the IBM extensions at 0xFA–0xFC; the spec encoder **skips 0xED–0xEE** (verified: ≒ is at 81E0 and 8790, ∵ at 81E6/879A/FA5B, ￢ at 81CA/EEF9/FA54; cp932 encodes them 81E0 81E6 81CA).
  - **EUC-JP**: 0x8E + 0xA1–0xDF = half-width katakana; 0x8F + two bytes 0xA1–0xFE = JIS X 0212 (decode-only in the spec encoder); otherwise lead/trail 0xA1–0xFE.
  - **EUC-KR** (= UHC/CP949): lead 0x81–0xFE, trail 0x41–0xFE. Rows 0xC9 and 0xFE are unassigned (fatal decode of most GBK text fails there — a useful discriminator).
  - **ISO-2022-JP** is stateful (escape sequences) → **decode-only** in this tool.
- Single-byte encodings share one decoder/encoder pattern; a few indexes have unmapped bytes (→ U+FFFD, error in fatal mode). windows-1252 maps every byte (0x81, 0x8D, 0x8F, 0x90, 0x9D → C1 controls U+0081…), so it is *always* "valid" — validity alone never rules it out.

### 2.2 `chardet` (npm, **v2.2.0, MIT**, ICU CharsetDetector port; 288 KB unpacked, pure JS, CJS `lib/index.js`)

- `import chardet from 'chardet'`; `chardet.analyse(bytes: Uint8Array): { name: string; confidence: number /* 0–100 */; lang?: string }[]` sorted by confidence desc. `chardet.detect()` returns only the top name. **Never** call `detectFile`/`detectFileSync` (they need `fs`; the package's `browser` field maps `lib/fs/node.js` → `lib/fs/browser.js`, which only throws if called). Import chardet **only in the worker**; confirm the production build prints no "Module 'fs' has been externalized" warning and the dashboard entry chunk is unchanged.
- Names it can emit → WHATWG label (drop anything not listed): `UTF-8`→`utf-8`, `UTF-16LE`→`utf-16le`, `UTF-16BE`→`utf-16be`, `Big5`→`big5`, `GB18030`→`gb18030`, `Shift_JIS`→`shift_jis`, `EUC-JP`→`euc-jp`, `EUC-KR`→`euc-kr`, `ISO-2022-JP`→`iso-2022-jp`, `ISO-8859-1`→`windows-1252`, `ISO-8859-2`→`iso-8859-2`, `ISO-8859-5`→`iso-8859-5`, `ISO-8859-6`→`iso-8859-6`, `ISO-8859-7`→`iso-8859-7`, `ISO-8859-8`→`iso-8859-8`, `ISO-8859-9`→`windows-1254`, `windows-1250`…`windows-1258`→same (lowercase), `windows-874`→`windows-874`, `KOI8-R`→`koi8-r`. **Drop**: `ASCII` (handled by our strict-UTF-8 layer), `UTF-32LE/BE`, `ISO-2022-KR`, `ISO-2022-CN` (unsupported by `TextDecoder`).
- Measured on our fixtures (`scratchpad/enc-assets/detect-proto.mjs`): every CJK sample scores **100** for the right encoding — at 48 bytes and at full length — with the runner-up ≤ 72; single-byte samples are right at 39–64 (Greek came back `ISO-8859-7` for a windows-1253 file — acceptable; Thai windows-874 was mis-ranked below EUC-JP:67 — the manual override in §7 must exist). **Not handled by chardet** (our own layers cover them): UTF-16 **without** BOM (chardet says windows-1252), pure ASCII (chardet says ISO-8859-1:60), binary garbage (chardet says Big5:44). 256 KiB sample → 76 ms.

### 2.3 Measured performance (Node 24, this machine; browsers are comparable)

50 MB Big5 file: fatal decode 171 ms · UTF-8 encode 101 ms · CRLF→LF regex 8 ms. Reverse-table build per encoding 7–33 ms (9k–24k entries). Conclusion: decode/convert the whole buffer in one call inside the worker; sample only for detection; skip the round-trip check above 64 MB.

### 2.4 Fixtures (pre-generated; copy what is marked *commit*)

Scratchpad dir `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/enc-assets/`:

- **`samples-fixture.json`** (*commit* as `src/tools/text-encoding-converter/fixtures/samples.json`, 16.6 KB): `samples[]` = 21 entries `{ label, pythonCodec, text, base64, reversible, bom? }` covering big5, gbk, gb18030 (incl. a 4-byte sample, `reversible: false`), shift_jis, euc-jp, euc-kr, iso-2022-jp (`reversible: false`), windows-1252/-1250/-1251/-1253/-874, iso-8859-2, koi8-r, utf-16le/be (with and without BOM), utf-8 (with and without BOM). Verified: `new TextDecoder(label, { fatal: true }).decode(bytes) === text` for all 21. `mojibake[]` = 8 cases `{ decodedAs, actual, garbled, truth, lossy }` where `garbled` was produced by Node's `TextDecoder` (ICU), not Python — Python's error recovery differs for multi-byte decoders. **Engines differ too** (found in T2): Chromium's Big5 table maps the ETEN area (pairs C6A1–C8FE) to kana/symbols where Node's ICU yields private-use characters, and Shift_JIS error recovery differs, so a garble captured in one engine may not repair losslessly in another. The fixtures were therefore chosen so Node and Chromium produce the same garble for every non-lossy case (verified with Playwright); the tool itself is always self-consistent because it inverts the decoder of the engine it runs in. 2 cases are `lossy: true` (the wrong decoder emitted U+FFFD, so bytes are gone and repair cannot be exact).
- Raw files for T2/T3 (not committed): `zh-hant.big5.txt`, `zh-hans.gbk.txt`, `zh-hans.gb18030.txt`, `gb18030-4byte.txt`, `ja.shift_jis.txt`, `ja.euc-jp.txt`, `ja.iso-2022-jp.txt`, `ko.euc-kr.txt`, `fr-de.cp1252.txt`, `pl.iso-8859-2.txt`, `ru.cp1251.txt`, `ru.koi8-r.txt`, `el.cp1253.txt`, `th.cp874.txt`, `zh-hant.utf8.txt`, `zh-hant.utf8-bom.txt`, `ja.utf16le-bom.txt`, `ja.utf16be-bom.txt`, `ja.utf16le-nobom.txt`, `ja.utf16be-nobom.txt`, `ascii.txt` (CRLF), `mixed-crlf.big5.txt` (2×CRLF + 2×LF), `empty.txt`, `binary.bin` (0x00–0xFF ×4), `mojibake-utf8-as-cp1252.txt`, **`large-50mb.big5.txt`** (52,428,861 bytes). `texts.json` holds the source strings. `proto.mjs` is the reverse-table prototype; `detect-proto.mjs` the chardet/validity matrix.

## 3. Supported encodings (the tool's single list; `encodings.ts`)

| Group | WHATWG label | Display name | Kind | Encoder (§5) |
|---|---|---|---|---|
| Unicode | `utf-8` | UTF-8 | unicode | native |
| Unicode | `utf-16le` | UTF-16 LE | unicode | own (trivial) |
| Unicode | `utf-16be` | UTF-16 BE | unicode | own (trivial) |
| Chinese | `big5` | Big5 (CP950, HKSCS) | multibyte | reverse table |
| Chinese | `gb18030` | GB18030 (GBK, GB2312, CP936) | multibyte | reverse table (1–2 byte only) |
| Japanese | `shift_jis` | Shift_JIS (CP932) | multibyte | reverse table |
| Japanese | `euc-jp` | EUC-JP | multibyte | reverse table |
| Japanese | `iso-2022-jp` | ISO-2022-JP | stateful | **none** (decode-only) |
| Korean | `euc-kr` | EUC-KR (CP949) | multibyte | reverse table |
| Western | `windows-1252` | Windows-1252 (Latin-1, ISO-8859-1) | single | reverse table |
| Western | `iso-8859-15` | ISO-8859-15 | single | reverse table |
| Western | `macintosh` | Mac OS Roman | single | reverse table |
| Central European | `windows-1250` / `iso-8859-2` | Windows-1250 · ISO-8859-2 | single | reverse table |
| Cyrillic | `windows-1251` / `koi8-r` / `koi8-u` / `iso-8859-5` / `ibm866` / `x-mac-cyrillic` | Windows-1251 · KOI8-R · KOI8-U · ISO-8859-5 · IBM866 · Mac Cyrillic | single | reverse table |
| Greek | `windows-1253` / `iso-8859-7` | Windows-1253 · ISO-8859-7 | single | reverse table |
| Turkish | `windows-1254` | Windows-1254 (ISO-8859-9) | single | reverse table |
| Hebrew | `windows-1255` / `iso-8859-8` | Windows-1255 · ISO-8859-8 | single | reverse table |
| Arabic | `windows-1256` / `iso-8859-6` | Windows-1256 · ISO-8859-6 | single | reverse table |
| Baltic | `windows-1257` / `iso-8859-13` | Windows-1257 · ISO-8859-13 | single | reverse table |
| Vietnamese | `windows-1258` | Windows-1258 | single | reverse table |
| Thai | `windows-874` | Windows-874 (TIS-620) | single | reverse table |
| Other | `iso-8859-3` / `-4` / `-10` / `-14` / `-16` | ISO-8859-3 … | single | reverse table |

Every entry must construct (`new TextDecoder(label)` in a test loops over the list and asserts `decoder.encoding === label`). Do **not** list `gbk` separately (same decoder as gb18030); do not list `x-user-defined`, `utf-16` (alias), or any replacement-family label.

## 4. Detection algorithm (`detect.ts`, pure; runs in the worker)

Input: `bytes: Uint8Array`. Use `sample = bytes.subarray(0, 256 KiB)` for everything below (`stream: true` on every fatal decode so a cut trailing sequence is not an error). Output: `{ bom, candidates, looksBinary }` where `candidates: Candidate[]`, `Candidate = { label, confidence: 0–100, band: 'high' | 'medium' | 'low', reasons: string[], valid: boolean, invalidSequences: number, preview: string, lang?: string }`.

1. **Empty input** → `candidates: []`, UI shows "The file is empty".
2. **BOM**: `EF BB BF` → `utf-8`; `FF FE` → `utf-16le`; `FE FF` → `utf-16be`. Record `bom` and push that label with confidence **100**, reason `Byte order mark`. Still run the remaining steps (a BOM can lie) but the BOM candidate stays first.
3. **Strict UTF-8**: `new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true })`. Success + any byte ≥ 0x80 → push `utf-8` **100**, reason `Valid UTF-8 with non-ASCII characters`. Success + all bytes < 0x80 → push `utf-8` **100**, reason `ASCII only — identical in every ASCII-compatible encoding`, and **skip steps 4–5** (nothing to detect). Failure → do not list utf-8 from chardet either (it is provably not UTF-8); it remains reachable via manual override, flagged invalid.
4. **UTF-16 without BOM**: over the sample count zero bytes at even and at odd offsets. With `pairs = floor(len / 2) ≥ 8`: if `oddZeros ≥ 0.3·pairs && evenZeros ≤ 0.02·pairs` → `utf-16le` **90**, reason `Null-byte pattern (every second byte)`; mirrored → `utf-16be` **90**.
5. **chardet**: for each `{ name, confidence, lang }` of `chardet.analyse(sample)`: map via §2.2 (drop unmapped); skip labels already pushed; skip `utf-8` if step 3 failed; push with the given confidence, reason `Byte statistics (chardet)` (+ `lang` for display).
6. **Fallback**: if no candidate was pushed, push `windows-1252` confidence **5**, reason `Fallback — every byte is valid in Windows-1252`.
7. **Validity + previews** for every candidate: `valid = fatal decode of sample (stream: true) succeeded`. If invalid, `invalidSequences` = count of U+FFFD in the non-fatal decode of the sample and `confidence = min(confidence, 20)`, reason `N undecodable sequences`. `preview` = non-fatal decode of the first **4 KiB** (`stream: true`, BOM consumed), leading U+FEFF removed, whitespace runs collapsed to one space, first **160** code points.
8. **Sort**: valid before invalid; then confidence desc; then the §3 table order. `band`: ≥ 80 high, ≥ 40 medium, else low.
9. **`looksBinary`**: true when no candidate is valid, or when the top candidate's 4 KiB non-fatal decode has more than **5 %** C0 control characters other than `\t \n \r \f \x1b` (or contains `\0` at all for an ASCII-compatible top candidate). The UI shows a warning but still lets the user proceed.

Required tests (`detect.test.ts`): each `samples.json` entry (decode its base64) yields its `label` as the **first** candidate (for `windows-1252` fixtures accept `windows-1252` first; for the 4-byte gb18030 sample accept `gb18030` first; for the `iso-8859-2` fixture accept `iso-8859-2` first; for windows-1253 accept `windows-1253` or `iso-8859-7` first; for windows-874 accept **any** first but assert `windows-874` is present and valid); BOM fixtures report `bom` and confidence 100; UTF-16 no-BOM fixtures → the right endianness first; pure ASCII → single `utf-8` candidate with the ASCII reason; `binary.bin` bytes → `looksBinary: true`; empty → `[]`; a 48-byte prefix of the Big5 sample still yields big5 first (chardet does; assert it).

## 5. Legacy encoder from the native decoder (`legacyEncoder.ts`, pure)

Browsers ship decoders for every legacy encoding but no encoder. Build the encoder by **enumerating byte sequences through the native decoder** and inverting the result — zero dependencies, exactly the browser's own tables. Verified in `proto.mjs`: byte-identical round trips for all ten legacy fixtures, 7–33 ms per table.

`getReverseTable(label): Map<string, Uint8Array>` (cached per label, built lazily):

1. **Single bytes**: for `b` in 0x00–0xFF decode `[b]` alone; keep results without U+FFFD. Exception: for `gb18030` **skip `b = 0x80`** so `€` maps to A2E3 (spec gb18030 encoder), not 0x80.
2. **Two-byte sequences** (multibyte labels only): all `lead ∈ 0x81–0xFE, trail ∈ 0x40–0xFE`, in **canonical pointer order** (lead ascending, trail ascending) with these encoding-specific orderings: **shift_jis** — leads 0xED–0xEE go in a *second* pass (so IBM extensions at 0xFA–0xFC win, as the spec encoder does); **big5** — leads 0xA1–0xFE first, then 0x81–0xA0 (HKSCS) in a second pass. **euc-jp** additionally enumerates `0x8F, a, b` for `a, b ∈ 0xA1–0xFE` in a third pass (JIS X 0212 — decode-only in the spec, but harmless and improves round trips). Emit all sequences of a pass into one buffer separated by `0x0A` (never a trail byte in any of these encodings), decode with **one** non-fatal `decode()` call, split on `\n`, and take entry *i* for sequence *i*. Skip entries that contain U+FFFD **or any ASCII character** (that means the trail byte was re-emitted after an error). **First-seen wins**, except for **big5 U+5341 十 and U+5345 卅, where the *last* standard-area pointer wins** (A451, A4CA — what CP950 and the WHATWG encoder produce). For the box-drawing duplicates (U+2550, U+255E, U+2561, U+256A) keep first-seen (A2A4, A2A5, A2A7, A2A6 — CP950 behaviour; the WHATWG encoder would emit the F9xx ETEN duplicates — document this deliberate deviation in a code comment).
3. Keys are strings (usually one code point; may be two for Big5 HKSCS pointers).

`encodeText(text, label): { bytes: Uint8Array; lost: number; lostSamples: string[] }` — for `utf-8` use `TextEncoder`; for `utf-16le`/`utf-16be` write code units; for `iso-2022-jp` throw `EncodingUnsupportedError`; otherwise walk code points, trying the 2-code-point key first, then 1; unmappable → `lost++`, emit `0x3F` (`?`), and remember up to 5 distinct samples. Preallocate a growing `Uint8Array` (no per-char array pushes for 50 MB inputs).

Required tests (`legacyEncoder.test.ts`): every `samples.json` entry with `reversible: true` round-trips **byte-identically** (`encodeText(decode(bytes), label).bytes` equals `bytes`, `lost === 0`); the `bom` entries round-trip against `bytes.slice(bomLength)`; `encodeText('十卅═', 'big5')` → `A4 51 A4 CA A2 A4`; `encodeText('≒∵￢', 'shift_jis')` → `81 E0 81 E6 81 CA`; `encodeText('ⅰ', 'shift_jis')` → `FA 40` (not `EE EF`); `encodeText('€', 'gb18030')` → `A2 E3` and `new TextDecoder('gb18030').decode([0x80]) === '€'`; `encodeText('𠀀', 'gb18030').lost === 1` (4-byte, not covered); `encodeText('ｱ', 'shift_jis')` → `B1` and `encodeText('ｱ', 'euc-jp')` → `8E B1`; `encodeText('é', 'windows-1252')` → `E9`; table build for big5 takes < 200 ms in the test runner.

## 6. Conversion and repair semantics (`convert.ts`, `mojibake.ts`, pure)

- `decodeAll(bytes, label): { text, replacements, bomStripped }` — non-fatal decode of the **whole** buffer in one call (`ignoreBOM: false` so a BOM is consumed; `bomStripped` = the buffer started with that encoding's BOM). `replacements` = count of U+FFFD in `text` (documented caveat: a literal U+FFFD in the source counts too).
- `lineEndings(text): { crlf, lf, cr, kind: 'lf' | 'crlf' | 'cr' | 'mixed' | 'none' }` (single regex pass; `cr` counts lone `\r`).
- `normalizeLineEndings(text, 'keep' | 'lf' | 'crlf')` via `/\r\n|\r|\n/g`.
- `convertToUtf8(text, { bom: boolean, lineEndings }): Uint8Array` — normalise, `TextEncoder.encode`, prepend `EF BB BF` when `bom`. Output filename: `<stem>.utf8<ext>` (e.g. `report.big5.txt` → `report.big5.utf8.txt`; no extension → `<name>.utf8.txt`).
- `roundTrip(bytes, label, text): { status: 'identical' | 'differs' | 'unsupported' | 'skipped'; differing?: number; firstOffset?: number }` — compare `encodeText(text, label).bytes` with `bytes` after the BOM; `skipped` when `bytes.length > 64 MiB`; `unsupported` for iso-2022-jp. This powers the "Lossless / Not reversible" badge and the plan's verification item.
- **Mojibake**: `repair(garbled, decodedAs, actual): { text, lost, replacements }` = `decodeAll(encodeText(garbled, decodedAs).bytes, actual)`; `lost` from the encoder (characters the wrong decoding never produced — usually U+FFFD it inserted), `replacements` from the final decode. `suggest(garbled): Suggestion[]` — for each `decodedAs` in {windows-1252, macintosh, windows-1250, windows-1251, iso-8859-2, koi8-r, big5, gb18030, shift_jis, euc-jp, euc-kr}: encode (skip if `lost > 20 %` of non-ASCII code points), run §4 detection on the bytes (utf-8 first when strictly valid), and for the top valid candidate ≠ `decodedAs` produce `{ decodedAs, actual, confidence, text, lost, replacements }`; sort by confidence desc, then fewer lost; return the top 5. Required tests (`mojibake.test.ts`): all 8 `samples.json` mojibake cases → `repair(garbled, decodedAs, actual).text === truth` for the 6 `lossy: false` cases; for the 2 lossy cases the result contains U+FFFD and `lost > 0` and the first 3 characters still match; `suggest(garbled)[0]` has the right `decodedAs`/`actual` pair for at least the 4 non-lossy cases whose `actual` is `utf-8` or whose garbled text is ≥ 20 code points.

## 7. UX specification

Use `ToolLayout` (`title="Text encoding converter"`, `description="Detect Big5, GBK, Shift_JIS, EUC-KR and other legacy encodings, convert to UTF-8, or undo mojibake"`, `badge="client-side"`). Conventions to copy: `src/tools/hex-viewer/HexViewer.tsx` (file drop → `arrayBuffer` → worker, summary cards), `src/tools/cvss-calculator/CvssCalculator.tsx` (tablist), `src/tools/diff-checker/DiffChecker.tsx` (textareas), `src/components/CopyButton.tsx`, `src/lib/download.ts` (`downloadBlob`), `src/lib/format.ts` (`formatBytes`), `src/lib/worker.ts` (`wrapWorker`), Comlink `transfer()` as in `src/tools/xlsx-csv-viewer/XlsxCsvViewer.tsx`.

**Mode tabs** (role=tablist): `Convert a file` (default) · `Repair mojibake`.

**Convert a file**
1. `FileDropzone` — any type, `maxSize` 256 MiB, hint `Any text file — .txt, .csv, .srt, .log, .sql, source code`, default privacy note. One file at a time (a new drop replaces the current one; `Clear` button).
2. **Summary card** (3 cells like the hex viewer): file name + size · `Byte order mark: none | UTF-8 | UTF-16 LE | UTF-16 BE` · `Line endings: LF | CRLF | CR | Mixed (n CRLF, m LF)` (filled after the first decode). A `looksBinary` warning banner: "This doesn't look like text — most bytes are control characters. You can still pick an encoding below."
3. **Detected encodings** list — each row is a radio-like button: rank, display name (+ `label` in mono), band chip (`High` pine / `Medium` amber / `Low` muted; `Invalid — n undecodable sequences` in the error colour), reasons as small text, and the 160-char preview in mono on one clipped line (`overflow-hidden text-ellipsis whitespace-nowrap`; on mobile 2 lines with `line-clamp-2`). The first candidate is selected automatically. Below the list: `Other encoding…` `<select>` listing every §3 entry grouped with `<optgroup>`; choosing one adds/selects it (it gets validity + preview computed the same way).
4. **Preview pane** for the selected encoding: `<pre>` (mono, wrapping, max-height ~ 24rem, scroll) showing the first **64 KiB** of the decoded text with a note `Showing the first 64 KB of 2.3 MB` when truncated; stat line `n characters · k undecodable sequences (shown as �)`; **round-trip badge**: `Lossless — re-encoding reproduces the original bytes` / `Not reversible — n bytes differ (first at offset 0x…)` / `Round-trip check skipped for files over 64 MB` / `ISO-2022-JP cannot be re-encoded here`.
5. **Output options**: `Target: UTF-8` (static text — the only target in this phase), `Add UTF-8 BOM` checkbox (default off; on by default only if the source had a BOM), `Line endings` radio `Keep / LF / CRLF` (default Keep), output filename shown (§6 rule). Buttons: `Download UTF-8` (primary), `Copy text` (enabled ≤ 2 MB of text), `Clear`.
6. States: while the worker runs show `Detecting…` / `Converting…` with the shared spinner or `ProgressBar` indeterminate; errors as toasts (`toast()`), never `alert()`. Keyboard: candidates are buttons (focusable, Enter/Space select).

**Repair mojibake**
1. Textarea `Garbled text` (mono, 8 rows, placeholder `e.g. Ã©tÃ© or 绻侀珨涓枃`), with a `Paste` hint; character count.
2. Two selects: `Was decoded as` (Auto + every §3 entry that has an encoder) and `Actually is` (Auto + UTF-8 + every §3 entry). With both Auto → show up to 5 suggestions as cards (`Windows-1252 → UTF-8 · High`, repaired preview 200 chars, `n characters could not be recovered`), click to expand; with one or both fixed → a single result. Debounce input 200 ms; run in the worker.
3. Result: `<pre>` with the repaired text, `Copy` button, `Download as UTF-8` (`repaired.txt`), and the loss note when `lost > 0` or `replacements > 0`: `n characters could not be recovered — the original decoding discarded those bytes`.

Both modes: no network at any point; nothing stored. Mobile (390 px): summary cells stack, candidate rows wrap, the two selects stack.

## 8. Code layout

```
src/tools/text-encoding-converter/
  TextEncodingConverter.tsx   page: tabs, worker lifecycle (create on mount, terminate on unmount), state
  CandidateList.tsx           ranked candidates + "Other encoding…" select
  ConvertPanel.tsx            summary, preview pane, output options, actions (may be folded into the page if < 250 lines)
  RepairPanel.tsx             mojibake textarea, selects, suggestions/result
  encodings.ts                §3 table (SUPPORTED_ENCODINGS), groups, display names, chardet → label map, hasEncoder(label)
  detect.ts                   §4 (imports chardet; pure functions, unit-tested in Node/jsdom)
  legacyEncoder.ts            §5 reverse tables + encodeText
  convert.ts                  §6 decodeAll, lineEndings, normalizeLineEndings, convertToUtf8, roundTrip, outputFilename
  mojibake.ts                 §6 repair, suggest
  encoding.worker.ts          Comlink `expose`: analyze(buffer) → { bom, candidates, looksBinary }; inspect(buffer, label) → { preview, chars, replacements, lineEndings, roundTrip, bomStripped }; convert(buffer, label, options) → transfer(Uint8Array); previewFor(buffer, label) → Candidate (for manual overrides); repair(text, decodedAs, actual); suggest(text)
  fixtures/samples.json       from §2.4
  *.test.ts                   detect, legacyEncoder, convert, mojibake, encodings (+ a light TextEncodingConverter.test.tsx render/tab test)
```

Worker notes: `new Worker(new URL('./encoding.worker.ts', import.meta.url), { type: 'module' })` via `wrapWorker`; pass the file's `ArrayBuffer` **once** and keep it in the worker (`analyze` stores it under an id or the worker keeps "current buffer" state — a single-file tool, so a `let current: Uint8Array | null` module variable is fine), so `inspect`/`convert` do not re-transfer 50 MB; `convert` returns `transfer(out, [out.buffer])`. Vitest runs in jsdom with Node's `TextDecoder` (full ICU) — the pure modules must not touch `window`/`document`.

## 9. Tasks (T1 — in order; `npm run lint` and `npm run typecheck` after each step; `npm run test` at the end)

1. `npm i chardet@2.2.0` (exact). Confirm `node_modules/chardet/package.json` says MIT.
2. `encodings.ts` + `encodings.test.ts` (every label constructs; `encoding === label`; chardet map covers §2.2).
3. `legacyEncoder.ts` + tests (§5), copying `samples-fixture.json` to `fixtures/samples.json` first.
4. `detect.ts` + tests (§4). `convert.ts` + tests (line-ending counting on a string with 2 CRLF + 2 LF + 1 lone CR → `mixed`; normalisation both ways; BOM prepend; filename rule; every roundTrip status). `mojibake.ts` + tests (§6).
5. `encoding.worker.ts`, then the UI (§7). Registry flip, route, registry test.
6. `npm run build`: record `dist/assets/index-*.js` size (must stay ≈ 265.9 kB), the tool chunk and the worker chunk sizes, and confirm no `fs` externalisation warning and that chardet is **not** in the entry chunk.
7. Manual smoke in `vite preview`: drop `zh-hant.big5.txt`, `ja.utf16le-nobom.txt`, `binary.bin`, `large-50mb.big5.txt`; paste the `mojibake` fixture text. Fix what you find. Do **not** commit — report files created, versions, gate output, bundle sizes, and every judgement call.

## 10. Verification (T2/T3, by the verifier — read-only; run against `npm run build` + `npm run preview` from the repo root on 127.0.0.1:4173 with Python Playwright)

T2 (functional, drive the real UI):
- Each raw fixture in §2.4 (except `large`, `empty`, `binary`) is dropped; assert the **first** candidate label per §4's expectations, the preview shows the expected first line from `texts.json`, and the downloaded UTF-8 file's bytes equal `text.encode('utf-8')` (exactly, no BOM by default); with the BOM checkbox on, the download starts with `EF BB BF`.
- `zh-hant.utf8-bom.txt` → candidate reason `Byte order mark`, BOM checkbox pre-checked, download has BOM; uncheck → no BOM.
- UTF-16 LE/BE with and without BOM decode identically to `texts.json` `ja`.
- `mixed-crlf.big5.txt` → line endings `Mixed (2 CRLF, 2 LF)`; `LF` option → output has no `\r`; `CRLF` → exactly 4 `\r\n`.
- Round-trip badge says lossless for the ten legacy fixtures and `gb18030-4byte.txt` says not reversible / lost (4-byte); `ja.iso-2022-jp.txt` decodes correctly and shows the "cannot be re-encoded" note.
- `binary.bin` → binary warning shown, still convertible.
- `empty.txt` → "file is empty" state, no crash.
- **50 MB**: drop `large-50mb.big5.txt` → detection result within 3 s; select → preview within 3 s; download → exactly **78,188,706 bytes** (the UTF-8 size of the file's Big5 decode, measured in Node; cross-check with Python `len(open(f,'rb').read().decode('big5').encode('utf-8'))`) and the page never blocks: measure with a `PerformanceObserver({ type: 'longtask' })` that no main-thread task exceeds **200 ms** during the whole flow.
- Mojibake: paste each of the 8 fixture `garbled` strings with both selects on Auto → top suggestion pair correct for the non-lossy cases; fixed pair → text equals `truth` (non-lossy) / contains `�` with a loss note (lossy).
- Manual override: pick `windows-874` from `Other encoding…` for `th.cp874.txt` → preview shows Thai.
- **Privacy**: network log across every step above shows only same-origin static assets (no request bodies, no third-party hosts).
- Console: no errors or React warnings across the flow.

T3 (visual): screenshots at 1280 and 390, light and dark: empty state; Big5 file with candidates + preview + options; the 50 MB file state; mojibake mode with suggestions. Check: no horizontal overflow at 390, long previews clipped not overflowing, contrast of the band chips, focus rings on candidate buttons.

Report PASS/FAIL per check with evidence; for failures give root cause and a proposed fix; do not edit files.

## 11. Definition of done

- All §9 gates green; `npm run test` includes the new suites; entry chunk unchanged; chardet only in the worker chunk.
- T2 all PASS (or fixed by the orchestrator and re-run); T3/T4 screenshots reviewed.
- PLAN.md Phase 57 gets a one-line implementation note (chardet as ranking signal + native-decoder reverse tables as encoder; CP950 box-drawing deviation; GB18030 4-byte decode-only).
- Commit subject: `feat: add text encoding converter (Phase 57)`.

---

## 12. Implementation notes (post-T1/T2, 2026-09-05)

Deviations from the sections above, all deliberate and covered by tests:

1. **§4 step 3 shortcut narrowed.** "ASCII only → skip detection" now requires no NUL byte (ASCII text stored as UTF-16 is all bytes < 0x80) and, when `0x1B` is present, chardet is still consulted for an ISO-2022-JP verdict, which is pushed at `max(confidence, 95)` so a mail-style file with a long ASCII header still ranks ISO-2022-JP first; the UTF-8 reading drops to 90 in that case and to 30 when the UTF-16 null-byte rule fires on ASCII bytes.
2. **§4 step 4 UTF-16 rule extended.** The null-byte rule cannot fire on CJK UTF-16 (3 zero bytes in the 222-byte Japanese fixture). A first attempt used "one byte of each pair barely varies", but legacy double-byte text has the same shape — Shift_JIS/EUC-JP/ISO-2022-JP prefixes of 70–110 bytes tripped it. The shipped rule decodes the sample in both byte orders and accepts the one that reads as coherent text (≥ 95 % letters, digits, punctuation and spaces by Unicode category, private-use and U+FFFD counting against; margin ≥ 0.05 over the other order) at confidence 85, only when there is no confident (≥ 80) chardet verdict for a legacy multi-byte encoding, the input is not valid non-ASCII UTF-8, the byte length is even, and there are at least 24 code units (48 bytes). Swept over every even prefix of every fixture: zero false positives; every UTF-16 fixture ≥ 48 bytes detected. Regression test: `detect.test.ts` "never ranks UTF-16 first for a legacy or UTF-8 fixture".
3. **`gbk` label folded into `gb18030`** (`canonicalLabel`), so fixtures labelled `gbk` are reported as GB18030 and € round-trips as A2E3.
4. **Round-trip check is a separate worker call** (`checkRoundTrip`) after `inspect`, so the 50 MB preview lands in ~0.3 s and the lossless badge fills in afterwards; candidate buttons stay enabled during a decode (out-of-order results are discarded by a run counter), and are disabled only during the initial detection.
5. **`filename.ts`** holds `outputFilename` so the page chunk never imports `convert.ts` → `detect.ts` → chardet (chardet lives only in the 57 kB worker chunk; the entry chunk is unchanged at 265.99 kB).
6. **Fixture engine sensitivity.** Node's ICU Big5 and Chromium's Big5 differ on the ETEN area (C6A1–C8FE: kana/symbols vs private-use), and Shift_JIS error recovery differs; the `big5 → gb18030` mojibake case was re-chosen so both engines garble it identically. The tool is self-consistent in any engine because it inverts that engine's decoder.
7. **Truncation note** counts characters ("Showing the first 65,536 of 26,669,016 characters"), since the preview limit is in code units, not bytes.
8. **Out of scope, recorded for Phase 61:** the app-wide light-theme badge chips (`bg-mint text-pine`, `bg-amber-soft text-amber-badge`) measure 2.97:1 and 4.17:1 contrast.
