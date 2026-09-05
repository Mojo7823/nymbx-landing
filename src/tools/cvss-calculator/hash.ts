/**
 * URL-hash ↔ calculator-state helpers. Pure: the component owns
 * `history.replaceState` and the `hashchange` listener.
 */

import { CvssParseError } from './vector'
import { parseV31, type V31Selection } from './v31/metrics'
import { parseV4, type V4Selection } from './v4/metrics'

export type CvssVersion = '3.1' | '4.0'

export type HashResult =
  | { kind: 'empty' }
  | { kind: 'v31'; selection: V31Selection; wasV30: boolean }
  | { kind: 'v4'; selection: V4Selection }
  | { kind: 'invalid'; message: string }

/** Strip the leading `#` and percent-decoding from a `location.hash` value. */
export function normalizeHash(hash: string): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}

/** Interpret a `location.hash` as a CVSS vector for one of the two versions. */
export function parseHash(hash: string): HashResult {
  const value = normalizeHash(hash)
  if (!value) return { kind: 'empty' }

  const head = value.split('/', 1)[0].toUpperCase()
  try {
    if (head === 'CVSS:4.0') return { kind: 'v4', selection: parseV4(value) }
    if (head === 'CVSS:3.1' || head === 'CVSS:3.0') {
      const { selection, wasV30 } = parseV31(value)
      return { kind: 'v31', selection, wasV30 }
    }
  } catch (cause) {
    return {
      kind: 'invalid',
      message:
        cause instanceof CvssParseError
          ? cause.message
          : 'The link contained an invalid CVSS vector.',
    }
  }
  return { kind: 'invalid', message: 'The link did not contain a CVSS v3.1 or v4.0 vector.' }
}

/** The `location.hash` (including `#`) that represents a vector string. */
export function toHash(vector: string): string {
  return `#${vector}`
}
