/**
 * Decoding the whole file, line-ending bookkeeping, the UTF-8 output and the
 * round-trip check behind the "Lossless / Not reversible" badge. Pure module.
 */

import { BOM_LENGTH, detectBom } from './detect'
import { encodeText, EncodingUnsupportedError } from './legacyEncoder'

/** Files larger than this skip the round-trip check (it would double the work). */
export const ROUND_TRIP_LIMIT = 64 * 1024 * 1024

export type LineEndingKind = 'lf' | 'crlf' | 'cr' | 'mixed' | 'none'
export type LineEndingOption = 'keep' | 'lf' | 'crlf'

export interface DecodeResult {
  text: string
  /** U+FFFD count. A literal U+FFFD in the source counts too — documented caveat. */
  replacements: number
  /** The buffer started with this encoding's BOM, which the decoder consumed. */
  bomStripped: boolean
}

export interface LineEndingCounts {
  crlf: number
  lf: number
  /** Lone carriage returns (not part of a CRLF). */
  cr: number
  kind: LineEndingKind
}

export type RoundTripStatus = 'identical' | 'differs' | 'unsupported' | 'skipped'

export interface RoundTrip {
  status: RoundTripStatus
  /** Number of differing bytes (including a length difference), when `differs`. */
  differing?: number
  /** Offset of the first difference, when `differs`. */
  firstOffset?: number
}

/** Decode the whole buffer in one call. A leading BOM is consumed, not emitted. */
export function decodeAll(bytes: Uint8Array, label: string): DecodeResult {
  const text = new TextDecoder(label).decode(bytes)
  let replacements = 0
  for (let i = text.indexOf('�'); i !== -1; i = text.indexOf('�', i + 1)) replacements++
  return { text, replacements, bomStripped: detectBom(bytes) === label }
}

/** Count CRLF / LF / lone CR in one pass. */
export function lineEndings(text: string): LineEndingCounts {
  let crlf = 0
  let lf = 0
  let cr = 0
  const pattern = /\r\n|\r|\n/g
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match[0] === '\r\n') crlf++
    else if (match[0] === '\n') lf++
    else cr++
  }
  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length
  const kind: LineEndingKind =
    kinds === 0 ? 'none' : kinds > 1 ? 'mixed' : crlf > 0 ? 'crlf' : lf > 0 ? 'lf' : 'cr'
  return { crlf, lf, cr, kind }
}

/** Rewrite every line break to one style, or leave the text alone. */
export function normalizeLineEndings(text: string, option: LineEndingOption): string {
  if (option === 'keep') return text
  return text.replace(/\r\n|\r|\n/g, option === 'crlf' ? '\r\n' : '\n')
}

export interface ConvertOptions {
  bom: boolean
  lineEndings: LineEndingOption
}

/** UTF-8 bytes for `text`, with the requested line endings and optional BOM. */
export function convertToUtf8(text: string, options: ConvertOptions): Uint8Array {
  const body = new TextEncoder().encode(normalizeLineEndings(text, options.lineEndings))
  if (!options.bom) return body
  const out = new Uint8Array(body.length + 3)
  out.set([0xef, 0xbb, 0xbf], 0)
  out.set(body, 3)
  return out
}

/**
 * Re-encode `text` back into `label` and compare with the original bytes
 * (after the BOM). This is what tells the user whether the conversion is
 * information-preserving.
 */
export function roundTrip(bytes: Uint8Array, label: string, text: string): RoundTrip {
  if (bytes.length > ROUND_TRIP_LIMIT) return { status: 'skipped' }
  let encoded: Uint8Array
  try {
    encoded = encodeText(text, label).bytes
  } catch (cause) {
    if (cause instanceof EncodingUnsupportedError) return { status: 'unsupported' }
    throw cause
  }

  const bom = detectBom(bytes)
  const original = bom === label ? bytes.subarray(BOM_LENGTH[bom]) : bytes

  let differing = Math.abs(original.length - encoded.length)
  let firstOffset =
    original.length === encoded.length ? -1 : Math.min(original.length, encoded.length)
  const shared = Math.min(original.length, encoded.length)
  for (let i = 0; i < shared; i++) {
    if (original[i] === encoded[i]) continue
    differing++
    if (firstOffset === -1 || i < firstOffset) firstOffset = i
  }
  if (differing === 0) return { status: 'identical' }
  return { status: 'differs', differing, firstOffset }
}
