/**
 * Encoding detection: BOM → strict UTF-8 → UTF-16 signals (null-byte pattern,
 * text plausibility) → chardet byte statistics, then validity + preview for
 * every candidate.
 *
 * Pure module (no DOM), unit-tested in jsdom/Node. `chardet` is imported here
 * and this file is only reachable from the worker, so the library never lands
 * in the dashboard entry chunk.
 */

import { analyse } from 'chardet'
import { chardetLabel, encodingInfo, encodingOrder } from './encodings'

/** Bytes of the file used for detection. */
export const SAMPLE_BYTES = 256 * 1024
/** Bytes decoded for the short candidate preview. */
export const PREVIEW_BYTES = 4 * 1024
/** Code points kept in the short candidate preview. */
export const PREVIEW_CHARS = 160

export type Band = 'high' | 'medium' | 'low'
export type BomKind = 'utf-8' | 'utf-16le' | 'utf-16be'

export interface Candidate {
  label: string
  /** 0–100. */
  confidence: number
  band: Band
  /** Why this candidate is listed, in the order the evidence was found. */
  reasons: string[]
  /** A fatal decode of the sample succeeded. */
  valid: boolean
  /** U+FFFD count in the sample when `valid` is false. */
  invalidSequences: number
  preview: string
  /** Language hint from chardet, when it offered one. */
  lang?: string
}

export interface Detection {
  bom: BomKind | null
  candidates: Candidate[]
  /** Most bytes look like control characters — probably not text at all. */
  looksBinary: boolean
}

const REPLACEMENT = '�'

/** Byte length of each BOM, so callers can slice it off. */
export const BOM_LENGTH: Readonly<Record<BomKind, number>> = {
  'utf-8': 3,
  'utf-16le': 2,
  'utf-16be': 2,
}

/** The BOM at the start of `bytes`, if any. */
export function detectBom(bytes: Uint8Array): BomKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8'
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  return null
}

/**
 * Does a fatal decode of `bytes` succeed? `stream: true` so a sequence cut by
 * the sample boundary is left pending instead of counting as an error.
 */
export function decodesCleanly(bytes: Uint8Array, label: string): boolean {
  try {
    new TextDecoder(label, { fatal: true }).decode(bytes, { stream: true })
    return true
  } catch {
    return false
  }
}

function countReplacements(text: string): number {
  let count = 0
  for (let i = text.indexOf(REPLACEMENT); i !== -1; i = text.indexOf(REPLACEMENT, i + 1)) count++
  return count
}

function decodeSample(bytes: Uint8Array, label: string): string {
  return new TextDecoder(label).decode(bytes, { stream: true })
}

/** First `PREVIEW_CHARS` code points of the file, whitespace collapsed. */
export function buildPreview(bytes: Uint8Array, label: string): string {
  const text = decodeSample(bytes.subarray(0, PREVIEW_BYTES), label)
  const collapsed = text
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return [...collapsed].slice(0, PREVIEW_CHARS).join('')
}

function band(confidence: number): Band {
  if (confidence >= 80) return 'high'
  if (confidence >= 40) return 'medium'
  return 'low'
}

interface RawCandidate {
  label: string
  confidence: number
  reasons: string[]
  lang?: string
}

/** Finish a raw candidate: fatal-decode validity, replacement count, preview. */
function finish(raw: RawCandidate, sample: Uint8Array): Candidate {
  const valid = decodesCleanly(sample, raw.label)
  const reasons = [...raw.reasons]
  let confidence = raw.confidence
  let invalidSequences = 0
  if (!valid) {
    invalidSequences = countReplacements(decodeSample(sample, raw.label))
    confidence = Math.min(confidence, 20)
    reasons.push(`${invalidSequences} undecodable sequence${invalidSequences === 1 ? '' : 's'}`)
  }
  return {
    label: raw.label,
    confidence,
    band: band(confidence),
    reasons,
    valid,
    invalidSequences,
    preview: buildPreview(sample, raw.label),
    lang: raw.lang,
  }
}

/** A candidate for a manually chosen encoding — no ranking evidence, just facts. */
export function candidateFor(bytes: Uint8Array, label: string): Candidate {
  const sample = bytes.subarray(0, SAMPLE_BYTES)
  return finish({ label, confidence: 0, reasons: ['Chosen manually'] }, sample)
}

interface Utf16Signal {
  label: 'utf-16le' | 'utf-16be'
  reason: string
  confidence: number
}

/** What ordinary text is made of: letters, marks, digits, punctuation, spaces, currency/math symbols, line breaks. */
const PLAUSIBLE_CHAR = /^[\p{L}\p{M}\p{N}\p{P}\p{Zs}\p{Sc}\p{Sm}\t\n\r]$/u
/** Code units needed before the plausibility rule is trusted (48 bytes). */
const UTF16_MIN_UNITS = 24
const UTF16_MIN_PLAUSIBILITY = 0.95
const UTF16_MIN_MARGIN = 0.05

/**
 * Share of code points in `text` that ordinary prose is made of. Private-use
 * and replacement characters count against it.
 */
export function textPlausibility(text: string): number {
  let total = 0
  let plausible = 0
  for (const char of text) {
    total++
    const code = char.codePointAt(0)!
    if ((code >= 0xe000 && code <= 0xf8ff) || code === 0xfffd) continue
    if (PLAUSIBLE_CHAR.test(char)) plausible++
  }
  return total === 0 ? 0 : plausible / total
}

function decodeFatal(bytes: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(bytes, { stream: true })
  } catch {
    return null
  }
}

/**
 * UTF-16 without a BOM — two signals.
 *
 * (1) The handout's null-byte rule: mostly-ASCII text stored as UTF-16 has
 * 0x00 in every second byte. It cannot fire for CJK text (our Japanese fixture
 * has 3 zero bytes in 222), so (2) decode the sample in both byte orders and
 * keep the one that reads as coherent text: ≥ 95 % letters, digits,
 * punctuation and spaces, clearly ahead of the other order.
 *
 * Byte statistics alone cannot tell UTF-16 from legacy double-byte text — both
 * have one steady and one varying byte per pair, and Shift_JIS prefixes pass
 * any "variety" test — so rule (2) is only consulted when chardet has no
 * confident legacy verdict (`allowPlausibility`), and it needs an even byte
 * length and at least 24 code units: below that, tiny mis-decoded CJK or Thai
 * files also read as plausible Hangul. Measured over every fixture prefix
 * (scratchpad `enc-assets/utf16-rule.mjs`): no false positive, and every
 * UTF-16 fixture of 48 bytes or more is found.
 */
function utf16Signal(sample: Uint8Array, allowPlausibility: boolean): Utf16Signal | null {
  const pairs = Math.floor(sample.length / 2)
  if (pairs < 8) return null

  let evenZeros = 0
  let oddZeros = 0
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] !== 0) continue
    if (i % 2 === 0) evenZeros++
    else oddZeros++
  }
  const nullReason = 'Null-byte pattern (every second byte)'
  if (oddZeros >= 0.3 * pairs && evenZeros <= 0.02 * pairs) {
    return { label: 'utf-16le', reason: nullReason, confidence: 90 }
  }
  if (evenZeros >= 0.3 * pairs && oddZeros <= 0.02 * pairs) {
    return { label: 'utf-16be', reason: nullReason, confidence: 90 }
  }

  if (!allowPlausibility || sample.length % 2 !== 0 || pairs < UTF16_MIN_UNITS) return null
  const scored = (['utf-16le', 'utf-16be'] as const)
    .map((label) => {
      const text = decodeFatal(sample, label)
      return { label, score: text === null ? -1 : textPlausibility(text) }
    })
    .sort((a, b) => b.score - a.score)
  const [best, other] = scored
  if (best.score >= UTF16_MIN_PLAUSIBILITY && best.score - other.score >= UTF16_MIN_MARGIN) {
    const percent = Math.round(best.score * 100)
    return {
      label: best.label,
      reason: `Reads as coherent text in this byte order (${percent} % letters, digits and punctuation)`,
      confidence: 85,
    }
  }
  return null
}

/** Legacy multi-byte or stateful CJK encoding (a confident chardet verdict for one of these outranks UTF-16 guesses). */
function isLegacyMultibyte(label: string): boolean {
  const kind = encodingInfo(label)?.kind
  return kind === 'multibyte' || kind === 'stateful'
}

const BINARY_ALLOWED = new Set([0x09, 0x0a, 0x0d, 0x0c, 0x1b])

function looksLikeBinary(sample: Uint8Array, top: Candidate | undefined): boolean {
  if (!top) return false
  const text = decodeSample(sample.subarray(0, PREVIEW_BYTES), top.label)
  if (text.length === 0) return false
  const asciiCompatible = top.label !== 'utf-16le' && top.label !== 'utf-16be'
  let controls = 0
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code === 0 && asciiCompatible) return true
    if (code < 0x20 && !BINARY_ALLOWED.has(code)) controls++
  }
  return controls / text.length > 0.05
}

/**
 * Rank the encodings this file could be in. `bytes` may be the whole file —
 * only the first `SAMPLE_BYTES` are examined.
 */
export function detectEncoding(bytes: Uint8Array): Detection {
  if (bytes.length === 0) return { bom: null, candidates: [], looksBinary: false }

  const sample = bytes.subarray(0, SAMPLE_BYTES)
  const raws: RawCandidate[] = []
  const byLabel = new Map<string, RawCandidate>()

  function push(label: string, confidence: number, reason: string, lang?: string) {
    const existing = byLabel.get(label)
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
      existing.confidence = Math.max(existing.confidence, confidence)
      existing.lang ??= lang
      return
    }
    const raw: RawCandidate = { label, confidence, reasons: [reason], lang }
    byLabel.set(label, raw)
    raws.push(raw)
  }

  // 2. Byte order mark — strong, but it can still lie, so detection continues.
  const bom = detectBom(sample)
  if (bom) push(bom, 100, 'Byte order mark')

  // 3. Strict UTF-8.
  const isUtf8 = decodesCleanly(sample, 'utf-8')
  const asciiText = sample.every((byte) => byte < 0x80)
  // Deviation from §4 step 3: NUL bytes disqualify the "ASCII only, nothing
  // to detect" shortcut. ASCII text stored as UTF-16 is all bytes < 0x80 too,
  // and taking the shortcut would skip the very step (4) that identifies it.
  const plainAscii = isUtf8 && asciiText && !sample.includes(0)

  // Deviation from §4 step 3: ISO-2022-JP is a 7-bit encoding, so an
  // ISO-2022-JP file *is* "ASCII only" and the shortcut would hide it behind
  // UTF-8 forever. When escape sequences are present we still ask chardet and
  // accept only its ISO-2022-JP verdict.
  // chardet runs once; ASCII-only input is consulted only for those escapes.
  const matches = !plainAscii || sample.includes(0x1b) ? analyse(sample) : []
  const escapeMatch = plainAscii
    ? matches.find((m) => chardetLabel(m.name) === 'iso-2022-jp')
    : undefined

  // 4. UTF-16 without a BOM. The text-plausibility rule is trusted only when
  // nothing else explains the bytes: not valid non-ASCII UTF-8, and no
  // confident chardet verdict for a legacy multi-byte encoding.
  const strongLegacy = matches.some((m) => {
    const label = chardetLabel(m.name)
    return m.confidence >= 80 && !!label && isLegacyMultibyte(label)
  })
  const utf16 = plainAscii ? null : utf16Signal(sample, !(isUtf8 && !asciiText) && !strongLegacy)

  if (escapeMatch) {
    // A mail-style file (long ASCII header, short Japanese run) can leave
    // chardet under 90, which would let the ASCII UTF-8 reading win and show
    // raw escape bytes; escapes are decisive, so lift it above that reading.
    push(
      'iso-2022-jp',
      Math.max(escapeMatch.confidence, 95),
      'Escape sequences (chardet)',
      escapeMatch.lang,
    )
  }
  if (utf16) push(utf16.label, utf16.confidence, utf16.reason)
  if (isUtf8) {
    // UTF-8 stays the top reading unless a positively identified encoding
    // explains the bytes better: ISO-2022-JP escapes, or ASCII text that is
    // really UTF-16 (where the UTF-8 reading is NUL-riddled).
    const confidence = utf16 && asciiText ? 30 : escapeMatch ? 90 : 100
    push(
      'utf-8',
      confidence,
      asciiText
        ? 'ASCII only — identical in every ASCII-compatible encoding'
        : 'Valid UTF-8 with non-ASCII characters',
    )
  }

  // 5. chardet byte statistics.
  if (!plainAscii) {
    for (const match of matches) {
      const label = chardetLabel(match.name)
      if (!label) continue
      if (label === 'utf-8' && !isUtf8) continue
      push(label, match.confidence, 'Byte statistics (chardet)', match.lang)
    }
  }

  // 6. Nothing at all — Windows-1252 accepts every byte.
  if (raws.length === 0) {
    push('windows-1252', 5, 'Fallback — every byte is valid in Windows-1252')
  }

  // 7. Validity, replacement counts and previews.
  const candidates = raws.map((raw) => finish(raw, sample))

  // 8. Valid first, then confidence, then the §3 table order.
  candidates.sort(
    (a, b) =>
      Number(b.valid) - Number(a.valid) ||
      b.confidence - a.confidence ||
      encodingOrder(a.label) - encodingOrder(b.label),
  )
  if (bom) {
    const index = candidates.findIndex((c) => c.label === bom)
    if (index > 0) candidates.unshift(...candidates.splice(index, 1))
  }

  return {
    bom,
    candidates,
    looksBinary: candidates.every((c) => !c.valid) || looksLikeBinary(sample, candidates[0]),
  }
}
