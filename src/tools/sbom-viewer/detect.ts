/**
 * Input sniffing and format detection. Pure and dependency-free — no Ajv, no
 * schemas — so both the worker (JSON path) and the main thread (XML path,
 * workers have no DOMParser) can import it.
 */
import type { SbomDocument } from './model'
import type { ValidationResult } from './report'

export type InputKind = 'json' | 'xml' | 'unknown'

/** Cheap sniff on the first non-whitespace character (BOM tolerated). */
export function sniffInput(text: string): InputKind {
  const head = text.replace(/^\uFEFF/, '').trimStart()
  if (head.startsWith('{') || head.startsWith('[')) return 'json'
  if (head.startsWith('<')) return 'xml'
  return 'unknown'
}

export interface DetectedFormat {
  format: 'CycloneDX' | 'SPDX'
  specVersion: string
}

/** `bomFormat: 'CycloneDX'` or the presence of `spdxVersion`; otherwise null. */
export function detectFormat(json: unknown): DetectedFormat | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const record = json as Record<string, unknown>
  const specVersion = typeof record.specVersion === 'string' ? record.specVersion : ''
  if (record.bomFormat === 'CycloneDX') return { format: 'CycloneDX', specVersion }
  if (typeof record.spdxVersion === 'string') {
    return { format: 'SPDX', specVersion: record.spdxVersion }
  }
  // Some generators omit `bomFormat`; a bare `specVersion` still identifies a BOM.
  if (record.bomFormat === undefined && specVersion) {
    return { format: 'CycloneDX', specVersion }
  }
  return null
}

export const UNKNOWN_FORMAT_MESSAGE =
  'This JSON is neither CycloneDX (no `bomFormat`) nor SPDX (no `spdxVersion`).'

/** File name without its last extension: `laravel.cdx.json` → `laravel.cdx`. */
export function fileStem(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/** Parser message plus the line/column of the offset, when the engine reports one. */
export function describeJsonError(error: unknown, text: string): string {
  const message = error instanceof Error ? error.message : 'Could not parse this file as JSON.'
  // Modern V8 already appends "(line N column M)" — don't say it twice.
  if (/line \d+/.test(message)) return message
  const match = /position (\d+)/.exec(message)
  if (!match) return message
  const position = Number(match[1])
  if (!Number.isFinite(position) || position > text.length) return message
  const before = text.slice(0, position)
  const line = before.split('\n').length
  const column = position - before.lastIndexOf('\n')
  return `${message} (line ${line}, column ${column})`
}

export interface XmlParseSuccess {
  ok: true
  doc: Document
}
export interface XmlParseFailure {
  ok: false
  message: string
}

/** DOMParser never throws — it returns a document containing `<parsererror>`. */
export function parseXml(text: string): XmlParseSuccess | XmlParseFailure {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const failure = doc.getElementsByTagName('parsererror')[0]
  if (failure) {
    return {
      ok: false,
      message: failure.textContent?.trim() || 'This file is not well-formed XML.',
    }
  }
  if (doc.documentElement.localName !== 'bom') {
    return {
      ok: false,
      message: `This XML has a <${doc.documentElement.localName}> root; a CycloneDX document has a <bom> root.`,
    }
  }
  return { ok: true, doc }
}

export const XML_NOT_VALIDATED =
  'XML documents are parsed but not schema-validated; convert to JSON for validation.'

export interface AnalyzeSuccess {
  ok: true
  doc: SbomDocument
  validation: ValidationResult
}

export interface AnalyzeFailure {
  ok: false
  /** `json`: syntax error · `format`: not an SBOM · `xml`: not well-formed. */
  kind: 'json' | 'format' | 'xml'
  message: string
}

export type AnalyzeResult = AnalyzeSuccess | AnalyzeFailure
