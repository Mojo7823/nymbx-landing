/**
 * Mojibake repair: text that was decoded with the wrong encoding is put back
 * through that wrong encoder to recover the original bytes, then decoded
 * again with the right one. Pure module.
 */

import { decodeAll } from './convert'
import { detectEncoding } from './detect'
import { encodeText } from './legacyEncoder'

export interface Repair {
  text: string
  /** Characters the wrong decoding never produced (usually U+FFFD it inserted). */
  lost: number
  /** U+FFFD in the final, repaired text. */
  replacements: number
}

export interface Suggestion extends Repair {
  decodedAs: string
  actual: string
  confidence: number
}

/**
 * Encodings worth trying as "what the text was wrongly decoded as". Ordered
 * roughly by how often each one causes mojibake in the wild.
 */
export const REPAIR_SOURCES: readonly string[] = [
  'windows-1252',
  'macintosh',
  'windows-1250',
  'windows-1251',
  'iso-8859-2',
  'koi8-r',
  'big5',
  'gb18030',
  'shift_jis',
  'euc-jp',
  'euc-kr',
]

/** Undo one wrong decoding: re-encode as `decodedAs`, decode as `actual`. */
export function repair(garbled: string, decodedAs: string, actual: string): Repair {
  const { bytes, lost } = encodeText(garbled, decodedAs)
  const { text, replacements } = decodeAll(bytes, actual)
  return { text, lost, replacements }
}

function nonAsciiCount(text: string): number {
  let count = 0
  for (const char of text) if (char.codePointAt(0)! > 0x7f) count++
  return count
}

/**
 * Guess the wrong/right encoding pair for garbled text: for each plausible
 * wrong decoder, recover the bytes and ask the detector what they really are.
 * Returns the five best pairs, most confident first.
 */
export function suggest(garbled: string): Suggestion[] {
  if (garbled.length === 0) return []
  const nonAscii = nonAsciiCount(garbled)
  const suggestions: Suggestion[] = []

  for (const decodedAs of REPAIR_SOURCES) {
    let bytes: Uint8Array
    let lost: number
    try {
      ;({ bytes, lost } = encodeText(garbled, decodedAs))
    } catch {
      continue
    }
    // More than a fifth of the non-ASCII characters unmappable means this
    // decoder could not have produced the text in the first place.
    if (nonAscii > 0 && lost > nonAscii * 0.2) continue

    const { candidates } = detectEncoding(bytes)
    const actual = candidates.find((c) => c.valid && c.label !== decodedAs)
    if (!actual) continue

    const { text, replacements } = decodeAll(bytes, actual.label)
    if (text === garbled) continue
    suggestions.push({
      decodedAs,
      actual: actual.label,
      confidence: actual.confidence,
      text,
      lost,
      replacements,
    })
  }

  suggestions.sort((a, b) => b.confidence - a.confidence || a.lost - b.lost)
  return suggestions.slice(0, 5)
}
