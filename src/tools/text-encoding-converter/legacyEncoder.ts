/**
 * A legacy-encoding *encoder* built from the browser's own *decoder*.
 *
 * Browsers ship WHATWG decoders for every legacy encoding but `TextEncoder`
 * only ever produces UTF-8. So we enumerate every byte sequence a legacy
 * encoding can form, push it through `TextDecoder`, and invert the result
 * into a `character → bytes` map. Zero dependencies, exactly the tables the
 * browser already has, and a table costs 7–33 ms to build (cached per label).
 */

import { encodingInfo } from './encodings'

export class EncodingUnsupportedError extends Error {
  constructor(public readonly label: string) {
    super(`${label} cannot be encoded — it is decode-only in this tool.`)
    this.name = 'EncodingUnsupportedError'
  }
}

export interface EncodeResult {
  bytes: Uint8Array
  /** Code points with no representation in the target encoding (written as `?`). */
  lost: number
  /** Up to 5 distinct examples of those code points, for the UI. */
  lostSamples: string[]
}

const REPLACEMENT = '�'
/**
 * `\n` separates enumerated sequences in the bulk decode. It is never a valid
 * trail byte in any encoding we enumerate, so it cannot be swallowed.
 */
const SEP = 0x0a

const tables = new Map<string, Map<string, Uint8Array>>()

interface Pass {
  /** Byte sequences to enumerate, in the order pointers should be considered. */
  sequences: number[][]
}

function twoBytePass(leads: number[]): Pass {
  const sequences: number[][] = []
  for (const lead of leads) {
    for (let trail = 0x40; trail <= 0xfe; trail++) sequences.push([lead, trail])
  }
  return { sequences }
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}

/**
 * Multi-byte enumeration order per label. Order matters because several
 * pointers decode to the same character and "first seen wins" decides which
 * bytes we emit — we follow what the WHATWG/vendor encoders produce.
 */
function passesFor(label: string): Pass[] {
  switch (label) {
    case 'shift_jis':
      // Leads 0xED–0xEE (NEC-selected IBM extensions) duplicate the IBM
      // extensions at 0xFA–0xFC. The spec encoder skips 0xED–0xEE, so they
      // go in a second pass and only fill in what 0xFA–0xFC did not cover.
      return [
        twoBytePass([...range(0x81, 0xec), ...range(0xef, 0xfe)]),
        twoBytePass(range(0xed, 0xee)),
      ]
    case 'big5':
      // Standard area first, HKSCS (leads 0x81–0xA0) second.
      return [twoBytePass(range(0xa1, 0xfe)), twoBytePass(range(0x81, 0xa0))]
    case 'euc-jp': {
      // Third pass: JIS X 0212 (0x8F + two bytes). Decode-only in the spec
      // encoder, but harmless here and it improves round trips.
      const jisX0212: number[][] = []
      for (let a = 0xa1; a <= 0xfe; a++) {
        for (let b = 0xa1; b <= 0xfe; b++) jisX0212.push([0x8f, a, b])
      }
      return [twoBytePass(range(0x81, 0xfe)), { sequences: jisX0212 }]
    }
    default:
      return [twoBytePass(range(0x81, 0xfe))]
  }
}

/**
 * Big5 duplicates where the *last* standard-area pointer must win: 十 and 卅
 * are at A2CC/A451 and A2CE/A4CA, and both CP950 and the WHATWG encoder emit
 * the A4xx one.
 *
 * Deliberate deviation: for the box-drawing duplicates U+2550 U+255E U+2561
 * U+256A U+256D U+256E U+256F U+2570 we keep first-seen (A2A4, A2A5, A2A7,
 * A2A6, A27E…) — CP950 behaviour, which is what files in the wild and every
 * Windows tool use. The WHATWG Big5 encoder would emit the F9xx ETEN
 * duplicates instead.
 */
const BIG5_LAST_POINTER = new Set(['十', '卅'])

function hasAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 0x80) return true
  return false
}

function buildTable(label: string): Map<string, Uint8Array> {
  const decoder = new TextDecoder(label, { fatal: false })
  const map = new Map<string, Uint8Array>()

  // 1. Single bytes.
  for (let byte = 0; byte <= 0xff; byte++) {
    // gb18030: 0x80 decodes to € but the spec gb18030 encoder writes A2E3
    // (only the gbk encoder uses 0x80). Skipping it here lets the two-byte
    // pass claim €.
    if (label === 'gb18030' && byte === 0x80) continue
    const decoded = decoder.decode(new Uint8Array([byte]))
    if (decoded.includes(REPLACEMENT)) continue
    if (!map.has(decoded)) map.set(decoded, new Uint8Array([byte]))
  }

  if (encodingInfo(label)?.kind !== 'multibyte') return map

  // 2. Multi-byte sequences, one bulk decode per pass.
  for (const { sequences } of passesFor(label)) {
    const buffer = new Uint8Array(sequences.reduce((n, s) => n + s.length + 1, 0))
    let at = 0
    for (const sequence of sequences) {
      buffer.set(sequence, at)
      at += sequence.length
      buffer[at++] = SEP
    }
    const parts = decoder.decode(buffer).split('\n')

    for (let i = 0; i < sequences.length; i++) {
      const part = parts[i]
      if (part === undefined) break
      if (part.includes(REPLACEMENT)) continue
      // An ASCII character in the output means the decoder errored and
      // re-emitted the trail byte — not a real mapping.
      if (hasAscii(part)) continue
      const overwrite = label === 'big5' && BIG5_LAST_POINTER.has(part)
      if (overwrite || !map.has(part)) map.set(part, Uint8Array.from(sequences[i]))
    }
  }

  return map
}

/**
 * `gbk` is its own canonical WHATWG name but shares the gb18030 decoder, and
 * this tool only offers `gb18030` (§3), so fold it in. The one behavioural
 * difference — the gbk *encoder* writes € as 0x80 — is resolved in favour of
 * gb18030's A2E3, which is what `iconv -t gb18030` and the spec produce.
 */
const ALIASES: Readonly<Record<string, string>> = { gbk: 'gb18030' }

/**
 * Canonical WHATWG label for any accepted alias (`gbk` → `gb18030`,
 * `latin1` → `windows-1252`, `utf-16` → `utf-16le`, …). Throws `RangeError`
 * for labels `TextDecoder` does not support.
 */
export function canonicalLabel(label: string): string {
  const canonical = new TextDecoder(label).encoding
  return ALIASES[canonical] ?? canonical
}

/** Reverse (character → bytes) table for a legacy label; built once, then cached. */
export function getReverseTable(label: string): Map<string, Uint8Array> {
  const canonical = canonicalLabel(label)
  let table = tables.get(canonical)
  if (!table) {
    table = buildTable(canonical)
    tables.set(canonical, table)
  }
  return table
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const bytes = new Uint8Array(text.length * 2)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), littleEndian)
  return bytes
}

/** Growing output buffer — no per-character array pushes for 50 MB inputs. */
class ByteSink {
  private buffer: Uint8Array
  private length = 0

  constructor(capacity: number) {
    this.buffer = new Uint8Array(Math.max(16, capacity))
  }

  push(bytes: ArrayLike<number>): void {
    if (this.length + bytes.length > this.buffer.length) {
      const grown = new Uint8Array(Math.max(this.buffer.length * 2, this.length + bytes.length))
      grown.set(this.buffer.subarray(0, this.length))
      this.buffer = grown
    }
    this.buffer.set(bytes, this.length)
    this.length += bytes.length
  }

  take(): Uint8Array {
    return this.buffer.slice(0, this.length)
  }
}

/**
 * Encode `text` into `label`. Unmappable code points become `?` and are
 * counted in `lost`. Throws `EncodingUnsupportedError` for iso-2022-jp.
 */
export function encodeText(text: string, label: string): EncodeResult {
  const canonical = canonicalLabel(label)
  if (canonical === 'utf-8') {
    return { bytes: new TextEncoder().encode(text), lost: 0, lostSamples: [] }
  }
  if (canonical === 'utf-16le' || canonical === 'utf-16be') {
    return { bytes: encodeUtf16(text, canonical === 'utf-16le'), lost: 0, lostSamples: [] }
  }
  if (canonical === 'iso-2022-jp') throw new EncodingUnsupportedError(canonical)

  const table = getReverseTable(canonical)
  const sink = new ByteSink(text.length + 16)
  let lost = 0
  const lostSamples: string[] = []

  for (let i = 0; i < text.length;) {
    const code = text.codePointAt(i)!
    const char = String.fromCodePoint(code)
    const width = char.length

    // Big5 has pointers that decode to two code points — try the pair first.
    if (i + width < text.length) {
      const next = String.fromCodePoint(text.codePointAt(i + width)!)
      const pair = table.get(char + next)
      if (pair) {
        sink.push(pair)
        i += width + next.length
        continue
      }
    }

    const bytes = table.get(char)
    if (bytes) {
      sink.push(bytes)
    } else {
      lost++
      if (lostSamples.length < 5 && !lostSamples.includes(char)) lostSamples.push(char)
      sink.push([0x3f])
    }
    i += width
  }

  return { bytes: sink.take(), lost, lostSamples }
}
