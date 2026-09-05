# Phase 58 Handout — PDF metadata viewer / sanitizer

**Audience:** the agent implementing Phase 58 (T1) and the agents verifying it (T2–T4). Self-contained; read fully before writing code. [/PLAN.md](../../PLAN.md) (Phase 58) and [/CLAUDE.md](../../CLAUDE.md) are authoritative if anything here seems ambiguous.

---

## 1. Goal

Add **PDF metadata sanitizer** at `/tools/pdf-metadata` (`src/tools/pdf-metadata/`): drop a PDF → see every metadata carrier it contains — the **Info dictionary** (Title, Author, Subject, Keywords, Creator, Producer, dates, Trapped, custom keys), the **XMP packet** (parsed properties + raw XML), **extra XMP streams** on pages and XObjects, **PieceInfo** private application data, the **document ID**, and whether a **digital signature** is present — then **edit** the Info fields, **strip everything** with one click, or strip selectively; see before/after size; download. All in a Web Worker; nothing leaves the browser; the original file is never modified.

Registry entry exists (`slug: 'pdf-metadata'`, `name: 'PDF metadata sanitizer'`, `phase: 58`, `status: soon`, category `pdf-office`). Flip it to `'available'`, add the lazy route in `src/tools/routes.ts`, and insert `'pdf-metadata'` into the "available" list in `src/lib/registry.test.ts` **in registry order** (after `'pdf-sign-annotate'`, before `'docx-to-html-markdown'`).

## 2. Sources of truth (verified 2026-09-05 with the repo's `pdf-lib` 1.17.1 — see the prototype `…/scratchpad/pdfmeta-assets/make-fixtures.mjs`, which also generates the fixtures)

### 2.1 pdf-lib facts (context7 `/hopding/pdf-lib` + prototype)

- **Always pass `{ updateMetadata: false }` to `PDFDocument.load()`** (and `create()`). The default stamps `Producer: pdf-lib (https://github.com/Hopding/pdf-lib)`, `Creator`, `CreationDate`/`ModDate` into the Info dictionary in the `PDFDocument` constructor — the opposite of what a sanitizer must do. (`save()` has no such option in pdf-lib 1.17; it only serialises. Pass `save({ updateFieldAppearances: false })` so form appearances are not redrawn either.) Verified: the output contains no `pdf-lib` string.
- Encrypted input: `load()` throws an `EncryptedPDFError` (message contains `is encrypted`). Do **not** use `ignoreEncryption: true` (the output would be unreadable). Map to the wording shared by the other PDF tools: `This PDF is password-protected. Remove the password first; encrypted files are not supported.`; anything else that fails to parse → `Could not read this file as a PDF. It may be corrupted or not a PDF at all.` (see `src/tools/pdf-sign-annotate/pdfDoc.ts` `pdfErrorMessage` and `src/tools/pdf-compress/PdfCompress.tsx`).
- **Info dictionary access.** `getInfoDict()` is `private` in the typings. Read it with `doc.context.lookupMaybe(doc.context.trailerInfo.Info, PDFDict)` (undefined when the file has no Info — fixture `xmp-only-no-info.pdf`). Create it when needed with `const dict = doc.context.obj({}); doc.context.trailerInfo.Info = doc.context.register(dict)`. Remove it entirely with `const ref = doc.context.trailerInfo.Info; delete doc.context.trailerInfo.Info; if (ref instanceof PDFRef) doc.context.delete(ref)` — and never call a metadata setter afterwards (each setter re-creates Info). Verified: the saved trailer has no `/Info`; pypdf reports `metadata: None`; pdfinfo prints no Title/Author.
- **Writing text values:** the public setters (`setTitle`, `setAuthor`, …) write `PDFHexString.fromText(value)` (UTF-16BE with BOM — correct for CJK). But `setKeywords(string[])` joins with **spaces**, turning `compliance, audit, 2025` into `compliance audit 2025` (visible in pdf.js and pypdf). Write **every** field yourself: `infoDict.set(PDFName.of(key), PDFHexString.fromText(value))`, and delete with `infoDict.delete(PDFName.of(key))`. Dates: `PDFString.fromDate(date)` gives `D:YYYYMMDDHHmmSSZ` (UTC) — verified via exiftool `Create Date: 2024:03:05 02:15:30Z`.
- **Reading values:** `PDFString` and `PDFHexString` both have `.decodeText()` (handles the UTF-16BE BOM and PDFDocEncoding). Other object types (`PDFName`, `PDFNumber`, arrays…) → display `.toString()` and keep them verbatim unless the user removes the key.
- **XMP packet:** `doc.catalog.get(PDFName.of('Metadata'))` → usually a `PDFRef`; `doc.context.lookupMaybe(ref, PDFStream)`; if it is a `PDFRawStream`, `decodePDFRawStream(stream).decode()` (exported from `'pdf-lib'`) returns the bytes with FlateDecode/LZW/ASCII filters undone (verified on uncompressed and Flate streams); decode as UTF-8 and strip a leading U+FEFF. Replace/create: `const s = doc.context.stream(bytes, { Type: 'Metadata', Subtype: 'XML' }); doc.catalog.set(PDFName.of('Metadata'), doc.context.register(s))` — **uncompressed**, as the XMP spec recommends so scanners can find the packet. Remove: `doc.catalog.delete(PDFName.of('Metadata'))` then `doc.context.delete(ref)`.
- **Other carriers** (all found in `full-metadata.pdf`, all read by exiftool — it reports page-level XMP titles as `[XMP-dc] Title`): catalog `/PieceInfo`; per page (`page.node`) `/PieceInfo` and `/Metadata`; XObjects — `page.node.Resources()?.get(PDFName.of('XObject'))` → dict of refs → `context.lookupMaybe(ref, PDFStream)` → `stream.dict` `/Metadata` and `/PieceInfo`, recursing into Form XObjects' own `/Resources` with a visited `Set` keyed by `ref.toString()`. The prototype's `stripDictMeta()` removes 2 extra streams from the fixture and exiftool then reports nothing but `PDF Version / Linearized / Page Count`.
- **Document ID:** `doc.context.trailerInfo.ID` is a `PDFArray` of two `PDFHexString`s or undefined. Reset: `doc.context.obj([PDFHexString.of(hex32), PDFHexString.of(hex32)])` from `crypto.getRandomValues(new Uint8Array(16))`. pdf-lib writes `/ID` into the trailer when set (verified through pypdf `reader.trailer['/ID']`).
- **Signatures:** `doc.catalog.get(PDFName.of('AcroForm'))` dict → `SigFlags` (PDFNumber, bit 1 = signatures exist) or any entry of `Fields` (or page `Annots`) whose `/FT` is `/Sig`. Fixture `signed-field.pdf` has `SigFlags 3` and one `/FT /Sig` widget. Saving through pdf-lib re-serialises the file and **invalidates** any signature — warn before the user downloads.
- `save({ updateMetadata: false })` rewrites the whole file (object streams on by default): earlier incremental revisions and orphaned objects — which can still contain old Info dictionaries — are **not** carried over. Say so in the result card. Sizes change (fixture 5,566 B → 1,028 B after strip); show before/after.
- Attachments (`catalog /Names /EmbeddedFiles`) may carry their own metadata; this phase only **counts** them and says "not modified".

### 2.2 pdf.js (not used by the tool — verifier oracle)

Judgement call recorded here: the plan lists pdf.js "for reading XMP", but the packet is plain XML and the page already has `DOMParser`; loading pdf.js (~1 MB) for a text view is not justified. pdf.js is used by the **verifier** in Node: `import { getDocument } from '/home/devi/nymbx-landing/node_modules/pdfjs-dist/legacy/build/pdf.mjs'`; `const task = getDocument({ data }); const pdf = await task.promise; const { info, metadata } = await pdf.getMetadata()`; `info` has `Title/Author/Subject/Keywords/Creator/Producer/CreationDate/ModDate`, `Custom` (custom Info keys) and `IsSignaturesPresent`; `metadata` is `null` when there is no XMP, otherwise `metadata.getRaw()` is the XML and `metadata.get('dc:title')` a parsed value; finish with `await task.destroy()`. Script: `…/scratchpad/pdfmeta-assets/pdfjs-meta.mjs <files>`. Encrypted input throws `PasswordException`.

### 2.3 Other oracles on this machine

- **exiftool 13.59** (pure Perl, fetched from GitHub): `perl /tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/pdfmeta-assets/exiftool/exiftool -G1 -a file.pdf`. Filter out the `[ExifTool]`, `[System]`, `[File]` groups; what remains is the metadata. A fully stripped file shows exactly `PDF Version`, `Linearized`, `Page Count`.
- **poppler**: `pdfinfo file.pdf` (Title/Author/Creator/Producer/dates as an external viewer sees them; `Metadata Stream: yes|no`), `pdfinfo -meta file.pdf` dumps the XMP.
- **pypdf 6.16.2**: `PdfReader(f).metadata` (None when no Info), `.xmp_metadata` (None when no XMP; `.dc_title`), `.trailer['/ID']`, `.pages[0].extract_text()`.

### 2.4 Fixtures — `/tmp/claude-1000/-home-devi-nymbx-landing/b14f9c57-88a0-427d-a794-a98d3b5d9d09/scratchpad/pdfmeta-assets/`

Commit the small ones (marked *commit*) to `src/tools/pdf-metadata/fixtures/` for unit tests (read with `fs.readFileSync` — Vitest runs in Node/jsdom).

| File | Size | Contents | |
|---|---|---|---|
| `full-metadata.pdf` | 5,566 B | Info with 10 keys: Title `Quarterly Compliance Report`, Author `Alice Example`, Subject `Internal assessment — draft`, Keywords `compliance audit 2025` (pdf-lib's `setKeywords` joined the list with spaces; the XMP packet has `compliance, audit, 2025`), Creator `Acme Writer 3.2`, Producer `Acme PDF Engine 9.1`, CreationDate `D:20240305021530Z`, ModDate `D:20250120090000Z`, custom `Company` = `Acme Corp`, custom `SourceModified` = `D:20240305101530+08'00'`; catalog XMP (uncompressed, 1,332 B, dc/xmp/pdf/xmpMM/photoshop properties, `xmpMM:DocumentID uuid:1111…`); one page-level XMP stream (title `Page-level XMP`) and one Form-XObject XMP stream (title `XObject-level XMP`); PieceInfo on the catalog and the page (2 dict entries, same object: `AcmeApp` with `Private: user=alice;machine=LAPTOP-42`); ID `0123456789abcdef0123456789abcdef` / `fedcba9876543210fedcba9876543210`; 1 page; no signature | *commit* |
| `xmp-only-no-info.pdf` | 1,490 B | **no Info dictionary**; Flate-compressed XMP with title `XMP-only Title`; no ID | *commit* |
| `info-only-cjk.pdf` | 834 B | Info only: Title `繁體中文標題 — Info only`, Author `王小明`, Creator `Word 365`, CreationDate `not-a-date` (unparsable); no XMP; no ID | *commit* |
| `no-metadata.pdf` | 723 B | no Info, no XMP, no ID | *commit* |
| `signed-field.pdf` | 1,077 B | Info (same as full) + AcroForm `SigFlags 3` + a `/FT /Sig` widget | *commit* |
| `full-objstm.pdf` | 1,745 B | Info + compressed XMP, saved with object streams | *commit* |
| `hundred-pages-meta.pdf` | 5,383,590 B | 100 pages, Info + XMP — performance check | scratch only |
| `encrypted.pdf` | 373,695 B | password-protected → error path | scratch only |
| `incremental-update.pdf` | 1,102 B | two revisions: the original Info (`Title (SECRET-ORIGINAL-TITLE)`, `Author (SECRET-AUTHOR)` as literal strings) plus an appended update whose trailer points `/Info` at a **new** object (`Title (Public title)`, `Producer (Updater 1.0)`) — the old Info is still in the file, unreferenced | *commit* |
| `proto-stripped.pdf`, `proto-edited.pdf` | | outputs of the prototype, for comparison | scratch only |

## 3. Behaviour specification

### 3.1 Reading — worker `open(buffer) → Summary`

```ts
interface InfoEntry { key: string; value: string; kind: 'text' | 'date' | 'other'; standard: boolean }
interface Summary {
  pages: number; bytes: number
  info: InfoEntry[] | null            // null = no Info dictionary at all
  xmp: string | null                  // catalog packet as text (BOM stripped); null when absent
  xmpBytes: number                    // decoded size, for display
  extraXmp: number                    // page + XObject /Metadata streams
  pieceInfo: number                   // catalog + page + XObject /PieceInfo entries
  id: [string, string] | null         // hex
  hasSignature: boolean
  attachments: number
}
```

Standard keys, in this order: `Title, Author, Subject, Keywords, Creator, Producer, CreationDate, ModDate, Trapped`; everything else is `standard: false`. `kind: 'date'` for CreationDate/ModDate (and any value matching the PDF date pattern); `'other'` for non-string objects (value = `toString()`).

**PDF dates** (`pdfDate.ts`): parse `^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(Z|[+-]\d{2}(?:'\d{2}'?)?)?$` leniently (missing parts default to 01/00; missing zone = local → treat as UTC for display but say "no time zone"); unparsable → `null` and the UI shows the raw string with "Unrecognised date format". Format for writing: `D:YYYYMMDDHHmmSSZ` (UTC).

### 3.2 XMP (`xmp.ts`, runs on the **main thread** — the worker has no DOMParser)

`parseXmp(xml)` → `{ properties: { name: string; value: string }[]; error?: string }` using `new DOMParser().parseFromString(xml, 'application/xml')`; a `parsererror` element → `error: 'The XMP packet is not well-formed XML'` and the raw text is still shown. Extract, from every `rdf:Description` (namespace `http://www.w3.org/1999/02/22-rdf-syntax-ns#`): child elements (value = text of the first `rdf:li` for `rdf:Alt`/`rdf:Seq`/`rdf:Bag` containers, all `rdf:li` joined with `; ` for Seq/Bag; otherwise `textContent.trim()`) **and** attribute-form properties (any attribute not in the `xmlns`/`rdf` namespaces). Name = `prefix:localName` using the well-known prefixes for `http://purl.org/dc/elements/1.1/` (dc), `http://ns.adobe.com/xap/1.0/` (xmp), `http://ns.adobe.com/pdf/1.3/` (pdf), `http://ns.adobe.com/xap/1.0/mm/` (xmpMM), `http://www.aiim.org/pdfa/ns/id/` (pdfaid), `http://ns.adobe.com/photoshop/1.0/` (photoshop); otherwise the document's own prefix. Render the raw packet with `textContent` in a `<pre>` — never `innerHTML` (an XMP packet is user-controlled XML).

`buildXmp(fields)` → minimal packet from the *resulting* Info fields, only non-empty ones: `dc:title` (rdf:Alt, x-default), `dc:creator` (rdf:Seq, one li), `dc:description` (rdf:Alt), `pdf:Keywords`, `pdf:Producer`, `xmp:CreatorTool`, `xmp:CreateDate`, `xmp:ModifyDate` (ISO 8601, `Z`). XML-escape `& < > "`. Wrapper: `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="…"><rdf:Description rdf:about="" xmlns:dc=… xmlns:xmp=… xmlns:pdf=…>…</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`. **No** `x:xmptk`, no `xmp:MetadataDate`, no `xmpMM` IDs — a sanitizer must not add data the user did not enter. If no field is non-empty, treat as `remove`.

### 3.3 Changing — worker `apply(changes) → { bytes, report }`

```ts
interface Changes {
  info: 'remove' | { set: Record<string, string>; remove: string[] }   // dates in `set` are ISO strings → PDF dates; '' in `set` means remove
  xmp: 'keep' | 'remove' | 'regenerate'
  extraXmp: boolean        // remove page/XObject /Metadata streams
  pieceInfo: boolean       // remove all /PieceInfo
  resetId: boolean         // replace /ID with two random 16-byte strings (also when the file had none)
}
interface Report {
  before: number; after: number
  infoSet: string[]; infoRemoved: string[]; infoDictRemoved: boolean
  xmp: 'kept' | 'removed' | 'regenerated' | 'created' | 'none'
  extraXmpRemoved: number; pieceInfoRemoved: number; idReset: boolean
  signatureInvalidated: boolean
}
```

The worker keeps the **original bytes**; every `apply` re-loads them (`updateMetadata: false`), applies the changes in this order — Info (set/remove/delete dict), XMP, extra XMP, PieceInfo, ID — and saves with `updateMetadata: false`. Presets: **Strip all** = `info: 'remove', xmp: 'remove', extraXmp: true, pieceInfo: true, resetId: true`. Output filename: `<stem>-clean.pdf` when `info === 'remove' && xmp === 'remove'`, otherwise `<stem>-edited.pdf` (matches `pdf-page-organizer`'s `-edited` / `pdf-compress`'s `-compressed` convention). Return `transfer(bytes, [bytes.buffer])`.

Required tests (`sanitize.test.ts`, `inspect.test.ts` on the committed fixtures, loading through pdf-lib in Node): `open` of `full-metadata.pdf` reports exactly the §2.4 values (10 Info keys, XMP 1,332 B, `extraXmp: 2`, `pieceInfo: 2`, the ID pair, `hasSignature: false`); `xmp-only-no-info.pdf` → `info: null`, XMP text contains `XMP-only Title`; `signed-field.pdf` → `hasSignature: true`; `no-metadata.pdf` → everything null/0. Strip all on `full-metadata.pdf` → re-loading the output finds no `/Info`, no catalog/page/XObject `/Metadata`, no `/PieceInfo` anywhere, a new ID ≠ the original, and the bytes contain none of `Acme`, `Alice`, `LAPTOP-42`, `Page-level`, `XObject-level`, `uuid:1111`, `pdf-lib`. Edit on `info-only-cjk.pdf` (`set: { Title: 'Edited 標題 ✓', Keywords: 'a, b; c' }, remove: ['CreationDate']`) → re-read Title/Keywords exactly (verbatim punctuation), CreationDate gone, Author still `王小明`, no `pdf-lib` string. `regenerate` → the new packet parses with DOMParser and `dc:title` equals the new Title; `xmp: 'keep'` leaves the packet byte-identical. Dates: parse/format round trip for `D:20240305021530Z`, `D:20240305101530+08'00'`, `D:2024`, `20240305`, and `not-a-date` → null. `buildXmp` escapes `&<>"`.

## 4. UX specification

Use `ToolLayout` (`title="PDF metadata sanitizer"`, `description="See exactly what a PDF says about you — edit the Info fields, or strip Info, XMP, PieceInfo and document IDs"`, `badge="client-side"`). Conventions: `src/tools/pdf-compress/PdfCompress.tsx` (PDF drop + error wording + result card with sizes), `src/tools/text-encoding-converter/` (summary card, worker keeping the file, `ProgressBar`), `src/components/CopyButton.tsx`, `src/lib/download.ts` (`downloadBlob`), `src/lib/format.ts` (`formatBytes`), `src/lib/worker.ts` (`wrapWorker`).

1. **Dropzone**: `accept="application/pdf,.pdf"`, `maxSize` 256 MiB, hint `PDF up to 256 MB`, default privacy note. One file; a new drop replaces it; `Clear`.
2. **Summary card** (like the hex viewer's three cells, wrapping on mobile): file name · size · pages; chips for what was found — `Info: 10 keys (2 custom)` / `Info: none`, `XMP: 1.3 KB` / `XMP: none`, `+2 XMP streams on pages/images`, `PieceInfo: 2`, `Document ID: set` / `none`, `Attachments: n (not modified)`. **Signature banner** (amber) when `hasSignature`: `This PDF contains a digital signature. Any change made here will invalidate it.`
3. **Info dictionary** section: one row per standard key — label, text `<input>` (placeholder `not set`), `×` clear button; `Trapped` is a `<select>` (`— / True / False / Unknown`); `CreationDate`/`ModDate` use `<input type="datetime-local" step="1">` (value from the parsed date in local time; raw PDF string shown underneath in mono; unparsable → raw string + `Unrecognised date format`, editing replaces it). Custom keys: listed as `key = value` rows with a `Remove` toggle (values read-only). Checkbox `Remove the entire Info dictionary` (disables the rows). When `info === null`: note `This file has no Info dictionary` and the empty rows (typing creates one).
4. **XMP metadata** section: parsed properties table (name mono, value wraps) or `No XMP packet`; `<details>` `Raw packet (1,332 bytes)` → `<pre>` mono, max-height 20 rem, scroll; radio `Keep as is` (default) / `Update to match the fields above` / `Remove` — when absent: `Don't add` (default) / `Create from the fields above`.
5. **Other carriers** section: checkboxes `Remove 2 additional XMP streams on pages and images`, `Remove PieceInfo (2 entries)`, `Replace the document ID with a new random one` (current ID shown in mono; when none: `Add a random document ID`); each disabled with `none found` when the count is 0 (except ID).
6. **Action bar**: `Strip all metadata` (secondary; sets every control to remove/reset and applies) · `Apply changes` (primary) · `Reset` (restore the original values/controls). While working: `ProgressBar` `Rewriting PDF…`.
7. **Result card** after apply: `Before 5.6 KB → After 1.0 KB (−82 %)`; report bullets (`Info dictionary removed`, `Title, Keywords set`, `CreationDate removed`, `XMP packet removed/regenerated`, `2 extra XMP streams removed`, `2 PieceInfo entries removed`, `Document ID replaced`, `Earlier revisions of the file were not carried over`, and — when a signature exists — `The digital signature is no longer valid`); output filename in mono; `Download` (primary) + `Verify in another tool` hint text. Changing any control after apply hides the result until re-applied.
8. States/errors: encrypted and non-PDF errors as toasts **and** inline under the dropzone; never `alert()`. Nothing persisted; no network at any point. Mobile (390 px): all sections single-column; the summary cells stack.

## 5. Code layout

```
src/tools/pdf-metadata/
  PdfMetadata.tsx        page: dropzone, worker lifecycle (create on first use, terminate on unmount), state, action bar, result card
  InfoForm.tsx           standard rows + custom keys + remove-dict checkbox
  XmpPanel.tsx           parsed table, raw <pre>, mode radio
  OtherPanel.tsx         extra XMP / PieceInfo / ID controls (fold into the page if < 120 lines)
  pdfDate.ts             parsePdfDate(raw) → Date | null, formatPdfDate(date) → 'D:…Z', toDatetimeLocal / fromDatetimeLocal helpers
  xmp.ts                 parseXmp(xml) (DOMParser), buildXmp(fields), XML escaping
  inspect.ts             summarize(doc: PDFDocument, bytes): Summary — pure pdf-lib, worker-side
  sanitize.ts            applyChanges(bytes, changes): Promise<{ bytes; report }> — pure pdf-lib, worker-side
  metadata.worker.ts     Comlink expose: open(buffer) → Summary (keeps the bytes), apply(changes) → transfer, close()
  filename.ts            outputFilename(name, changes)
  fixtures/*.pdf         the six *commit* fixtures from §2.4
  *.test.ts              pdfDate, xmp (jsdom DOMParser), inspect, sanitize, filename, PdfMetadata.test.tsx (render + dropzone present)
```

`pdf-lib` must be imported only in `inspect.ts`/`sanitize.ts`/the worker (and their tests) so it never reaches the page chunk; the dashboard entry chunk (`dist/assets/index-*.js`) must stay ≈ 265.9 kB.

## 6. Tasks (T1 — in order; `npm run lint` and `npm run typecheck` after each step; `npm run test` at the end)

1. Copy the six *commit* fixtures; `pdfDate.ts` + tests; `xmp.ts` + tests.
2. `inspect.ts` + tests (§3.1 values for every fixture).
3. `sanitize.ts` + tests (§3.3), `filename.ts` + test.
4. `metadata.worker.ts`, then the UI (§4). Registry flip, route, registry test.
5. `npm run build`: record the entry chunk size (≈ 265.9 kB), the tool chunk and the worker chunk; confirm `pdf-lib` is not in the entry or tool chunk.
6. Manual smoke in `vite preview` (start from the repo root; stop with `kill <pid>` from `ss -ltnp | grep 4173`, never `pkill -f`): drop `full-metadata.pdf` → strip all → download → run `pdfjs-meta.mjs` and exiftool on the download; drop `encrypted.pdf` → error; drop `hundred-pages-meta.pdf` → note open/apply timings. Fix what you find. Do **not** commit; do not edit PLAN.md. Report files, gates (file/test counts), bundle sizes, smoke results and every judgement call.

## 7. Verification (T2/T3, by the verifier — read-only; `npm run build` + `npm run preview` from the repo root on 127.0.0.1:4173, Python Playwright)

T2 (functional, through the real UI; downloads checked with exiftool, pdf.js (`pdfjs-meta.mjs`), pdfinfo and pypdf):
- `full-metadata.pdf`: summary chips match §2.4 (10 keys / 2 custom, XMP 1.3 KB, +2 streams, PieceInfo 2, ID set, no signature); the Info rows show the exact values and both dates parse (raw strings shown); XMP table shows `dc:title Quarterly Compliance Report`, `xmpMM:DocumentID uuid:1111…`, `photoshop:AuthorsPosition Compliance Lead`. **Strip all** → download `full-metadata-clean.pdf`; exiftool prints only `PDF Version / Linearized / Page Count`; pdf.js `info` has none of Title/Author/Subject/Keywords/Creator/Producer/CreationDate/ModDate/Custom keys and `metadata === null`; `pdfinfo -meta` prints nothing and `pdfinfo` shows no Title/Author/Creator/Producer and `Metadata Stream: no`; pypdf `metadata is None`, `xmp_metadata is None`, `trailer['/ID']` differs from `0123…`; `pages[0].extract_text()` still contains `Full metadata fixture`; the result card shows before/after sizes and the download is smaller than the input; the bytes contain none of `Acme`, `Alice`, `LAPTOP-42`, `uuid:1111`, `pdf-lib`.
- **Edit** on `full-metadata.pdf`: Title → `Edited 標題 ✓`, Keywords → `a, b; c`, clear Author, remove custom `Company`, XMP `Update to match`, apply → `full-metadata-edited.pdf`: exiftool/pdfinfo/pdf.js all show Title `Edited 標題 ✓` and Keywords exactly `a, b; c`, no Author, no Company, `SourceModified` still present; XMP `dc:title` = `Edited 標題 ✓` and the packet has no `xmpMM`/`photoshop` properties and no `MetadataDate`; no `pdf-lib` string anywhere.
- `xmp-only-no-info.pdf`: `Info: none`; XMP title shown; edit Title `Now with Info` + XMP Keep → output has an Info dict with exactly one key and the original XMP (byte-identical packet per pypdf `xmp_metadata.dc_title`); strip all → also clean.
- `info-only-cjk.pdf`: CJK Title/Author displayed correctly; `CreationDate` row shows `not-a-date` + `Unrecognised date format`; setting a date writes a valid `D:…Z` (pdfinfo shows it).
- `no-metadata.pdf`: every section reports none; strip all still produces a valid file (pdfinfo Pages 1) with a new ID.
- `signed-field.pdf`: amber signature banner; result card says the signature is no longer valid; pdf.js `IsSignaturesPresent` true on the input.
- `full-objstm.pdf`: compressed XMP decoded and shown; strip all clean.
- `encrypted.pdf` → the exact password error; nothing else rendered. A non-PDF: a `.txt` file is refused by the dropzone's accept filter; a text file renamed `.pdf` → the corrupted-file error.
- `hundred-pages-meta.pdf` (5.4 MB): open ≤ 3 s, apply ≤ 5 s, no main-thread long task > 200 ms (`PerformanceObserver` longtask), output opens in pypdf with 100 pages.
- **Original untouched**: sha256 of every input file on disk is unchanged after the whole run.
- **Privacy**: only same-origin GETs in the network log; **console** clean.

T3 (visual): 1280×800 and 390×844, light and dark: empty state; `full-metadata.pdf` loaded (top: summary + Info form; scrolled: XMP + other + action bar); result card after strip all; the signature banner. No horizontal overflow at 390; long XMP values wrap; focus rings on inputs/buttons; band/chip contrast (note the known app-wide light-theme chip debt from Phase 57 — report, don't fail the phase on it).

## 8. Definition of done

- All §6 gates green; new suites in `npm run test`; entry chunk unchanged; pdf-lib only in the worker chunk.
- T2 all PASS (or fixed by the orchestrator and re-run); T3/T4 screenshots reviewed.
- PLAN.md Phase 58 gets an implementation note (pdf-lib low-level access, `updateMetadata: false`, DOMParser instead of pdf.js for XMP, carriers covered, signature warning).
- Commit subject: `feat: add PDF metadata sanitizer (Phase 58)`.

---

## 9. Implementation notes (post-T1/T2, 2026-09-05)

1. **Orphaned objects are removed (added after T2).** pdf-lib parses every indirect object in the byte stream — including objects of earlier incremental revisions that nothing references — and writes them all back. On `incremental-update.pdf`, "strip all" therefore still carried the old `SECRET-ORIGINAL-TITLE` Info dictionary into the output, inside a Flate-compressed object stream where a plain text search (and the T2 forbidden-string check) could not see it. `reachability.ts` walks Root/Info/Encrypt/ID and deletes every unreachable object before save; the summary shows `Unreferenced objects: n (earlier revisions)` and the result card reports how many were dropped. Verify such leaks with `pypdf` over **all** xref entries (`scratchpad/pdfmeta-assets/enumerate-objects.py <pdf> SECRET`), never with `grep` on the bytes.
2. `save()` has no `updateMetadata` option (see §2.1); `updateFieldAppearances: false` is passed so a form's appearance streams are never redrawn.
3. `/Trapped` is written as a name object (`/True`), per PDF 32000-1 §14.11.3; every other Info value as `PDFHexString.fromText` (UTF-16BE), so `a, b; c` stays verbatim (exiftool re-splits Info keywords on `;` in its own output — pdfinfo, pypdf and pdf.js show the literal string).
4. XMP is parsed on the main thread with `DOMParser` (`xmp.ts`); `buildXmp` runs in the worker and needs no DOM. A `<script>` payload in a Title is stored verbatim, escaped in the regenerated packet, and rendered as text.
5. The page/XObject XMP copies are left alone when only the catalog packet is regenerated; the XMP panel says so when such copies exist, so identifiers in them are not mistaken for scrubbed.
6. Every registry entry is now `available`; the `soon` constant was removed from `registry.ts` (Phases 59–60 extend existing tools).
