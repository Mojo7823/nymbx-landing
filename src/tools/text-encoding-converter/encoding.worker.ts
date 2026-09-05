/// <reference lib="webworker" />
import { expose, transfer } from 'comlink'
import {
  convertToUtf8,
  decodeAll,
  lineEndings,
  roundTrip,
  type ConvertOptions,
  type LineEndingCounts,
  type RoundTrip,
} from './convert'
import { candidateFor, detectEncoding, type Candidate, type Detection } from './detect'
import { repair, suggest, type Repair, type Suggestion } from './mojibake'

/**
 * The single file under conversion. Kept here so `inspect`/`convert` never
 * re-transfer a 50 MB buffer, and dropped as soon as the page clears the file.
 */
let current: Uint8Array | null = null
/** Last decode, cached so a 50 MB file is decoded once per encoding choice. */
let decoded: { label: string; text: string; replacements: number; bomStripped: boolean } | null =
  null

function buffer(): Uint8Array {
  if (!current) throw new Error('No file loaded in the worker.')
  return current
}

function decodeCurrent(label: string) {
  if (decoded?.label !== label) decoded = { label, ...decodeAll(buffer(), label) }
  return decoded
}

export interface Inspection {
  /** First 64 KiB of the decoded text, for the preview pane. */
  preview: string
  /** Whether `preview` is shorter than the decoded text. */
  truncated: boolean
  /** Code point count of the whole decoded text. */
  chars: number
  replacements: number
  lineEndings: LineEndingCounts
  bomStripped: boolean
}

/** Characters shown in the preview pane. */
export const PREVIEW_LIMIT = 64 * 1024

const api = {
  /** Load a file and rank the encodings it could be in. Replaces any previous file. */
  analyze(bytes: ArrayBuffer): Detection {
    current = new Uint8Array(bytes)
    decoded = null
    return detectEncoding(current)
  },

  /** Forget the loaded file. */
  clear(): void {
    current = null
    decoded = null
  },

  /**
   * Decode the whole file with `label` and report what the preview pane shows.
   * The round-trip check is a separate call: it costs several seconds on a
   * 50 MB file and the preview must not wait for it.
   */
  inspect(label: string): Inspection {
    const { text, replacements, bomStripped } = decodeCurrent(label)
    return {
      preview: text.slice(0, PREVIEW_LIMIT),
      truncated: text.length > PREVIEW_LIMIT,
      chars: text.length,
      replacements,
      lineEndings: lineEndings(text),
      bomStripped,
    }
  },

  /** Re-encode the decoded text and compare it with the original bytes. */
  checkRoundTrip(label: string): RoundTrip {
    return roundTrip(buffer(), label, decodeCurrent(label).text)
  },

  /** Validity + preview for an encoding the user picked by hand. */
  previewFor(label: string): Candidate {
    return candidateFor(buffer(), label)
  },

  /** Decode with `label`, re-encode as UTF-8 with the chosen options. */
  convert(label: string, options: ConvertOptions): Uint8Array {
    const out = convertToUtf8(decodeCurrent(label).text, options)
    return transfer(out, [out.buffer])
  },

  /** The whole decoded text, for "Copy text". */
  text(label: string): string {
    return decodeCurrent(label).text
  },

  /** Mojibake repair with a known wrong/right pair. */
  repair(garbled: string, decodedAs: string, actual: string): Repair {
    return repair(garbled, decodedAs, actual)
  },

  /** Mojibake repair with one or both sides unknown. */
  suggest(garbled: string): Suggestion[] {
    return suggest(garbled)
  },
}

export type EncodingWorkerApi = typeof api

expose(api)
