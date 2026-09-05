/// <reference lib="webworker" />
import { expose } from 'comlink'
import {
  UNKNOWN_FORMAT_MESSAGE,
  describeJsonError,
  detectFormat,
  type AnalyzeResult,
} from './detect'
import { normalizeCycloneDx, normalizeSpdx } from './model'
import { validateDocument } from './validate'

/**
 * Parse, schema-validate and normalize an SBOM in one round trip, off the main
 * thread — a 4 MB / 10 000-component document must not freeze the UI.
 *
 * Ajv and the schema JSON are imported only from here, so they land in the
 * worker chunk and never in the dashboard bundle. Nothing leaves the device.
 */
const api = {
  async analyzeJson(text: string): Promise<AnalyzeResult> {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      return { ok: false, kind: 'json', message: describeJsonError(error, text) }
    }

    const detected = detectFormat(parsed)
    if (!detected) return { ok: false, kind: 'format', message: UNKNOWN_FORMAT_MESSAGE }

    const validation = await validateDocument(parsed, detected.format, detected.specVersion)
    const doc = detected.format === 'CycloneDX' ? normalizeCycloneDx(parsed) : normalizeSpdx(parsed)
    return { ok: true, doc, validation }
  },
}

export type SbomWorkerApi = typeof api

expose(api)
