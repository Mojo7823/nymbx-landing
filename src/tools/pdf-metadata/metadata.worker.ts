/// <reference lib="webworker" />
import { expose, transfer } from 'comlink'
import { PDFDocument } from 'pdf-lib'
import { summarize } from './inspect'
import { applyChanges } from './sanitize'
import type { Changes, Report, Summary } from './types'

/**
 * The dropped file, kept here so every `apply` starts from the untouched
 * original instead of stacking edits on an already-rewritten document — and so
 * a large PDF crosses the worker boundary exactly once.
 */
let original: Uint8Array | null = null

const api = {
  /** Read every metadata carrier. Replaces any previously loaded file. */
  async open(buffer: ArrayBuffer): Promise<Summary> {
    const bytes = new Uint8Array(buffer)
    // `updateMetadata: false`: the pdf-lib default stamps its own
    // Producer/Creator/ModDate into the Info dictionary at load time.
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    const summary = summarize(doc, bytes)
    original = bytes
    return summary
  },

  /** Apply `changes` to the original bytes and return the rewritten PDF. */
  async apply(changes: Changes): Promise<{ bytes: Uint8Array; report: Report }> {
    if (!original) throw new Error('No PDF loaded in the worker.')
    const result = await applyChanges(original, changes)
    return transfer(result, [result.bytes.buffer])
  },

  /** Forget the loaded file. */
  close(): void {
    original = null
  },
}

export type MetadataWorkerApi = typeof api

expose(api)
