import { YAMLException, dump as yamlDump, load as yamlLoad } from 'js-yaml'
import { TomlError, parse as tomlParse, stringify as tomlStringify } from 'smol-toml'
import { validateJson } from '../json-formatter/jsonTools'

export type Format = 'json' | 'yaml' | 'toml'

export const FORMAT_LABELS: Record<Format, string> = {
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
}

export interface ConvertError {
  message: string
  line?: number
  col?: number
}

export type ParseOutcome = { ok: true; value: unknown } | { ok: false; error: ConvertError }

/** V8's JSON.parse messages lack positions — Phase 23's validator has them. */
function jsonError(err: unknown, text: string): ConvertError {
  const checked = validateJson(text)
  if (!checked.ok && checked.error) {
    return { message: checked.error.message, line: checked.error.line, col: checked.error.col }
  }
  return { message: err instanceof Error ? err.message : String(err) }
}

export function parseAs(text: string, format: Format): ParseOutcome {
  try {
    if (format === 'json') return { ok: true, value: JSON.parse(text) }
    // integersAsBigInt: smol-toml otherwise rejects integers beyond 2^53.
    if (format === 'toml') return { ok: true, value: tomlParse(text, { integersAsBigInt: true }) }
    return { ok: true, value: yamlLoad(text) }
  } catch (err) {
    if (format === 'json') return { ok: false, error: jsonError(err, text) }
    if (err instanceof TomlError) {
      return {
        ok: false,
        error: {
          message: err.message.split('\n')[0].replace(/^Invalid TOML document:\s*/, ''),
          line: err.line,
          col: err.column,
        },
      }
    }
    if (err instanceof YAMLException) {
      return {
        ok: false,
        error: {
          message: err.reason || err.message,
          ...(err.mark && { line: err.mark.line + 1, col: err.mark.column + 1 }),
        },
      }
    }
    return { ok: false, error: { message: err instanceof Error ? err.message : String(err) } }
  }
}

export type Detection =
  { format: Format; value: unknown } | { format: null; errors: Record<Format, ConvertError> }

/**
 * Try the input as JSON, then TOML, then YAML (strictest first — YAML accepts
 * almost anything as a scalar). Returns per-format errors when nothing parses.
 */
export function detectAndParse(text: string): Detection {
  const results = {} as Record<Format, ParseOutcome>
  for (const format of ['json', 'toml', 'yaml'] as const) {
    const r = parseAs(text, format)
    if (r.ok) return { format, value: r.value }
    results[format] = r
  }
  const errors = {} as Record<Format, ConvertError>
  for (const format of ['json', 'toml', 'yaml'] as const) {
    const r = results[format]
    if (!r.ok) errors[format] = r.error
  }
  return { format: null, errors }
}

interface NormalizeStats {
  /** Null/undefined values — TOML cannot represent them and drops them. */
  nulls: number
  /** BigInts beyond double precision that became strings (JSON/YAML targets). */
  bigints: number
}

/** Prepare a parsed tree for the target serializer (bigint / null handling). */
function normalize(value: unknown, target: Format, stats: NormalizeStats): unknown {
  if (value === null || value === undefined) {
    stats.nulls++
    return null
  }
  if (typeof value === 'bigint') {
    if (target === 'toml') return value
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value)
    }
    stats.bigints++
    return value.toString()
  }
  if (value instanceof Date) return value
  if (Array.isArray(value)) return value.map((v) => normalize(v, target, stats))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v, target, stats)
    return out
  }
  return value
}

export interface ConvertResult {
  ok: boolean
  output?: string
  error?: string
  warnings: string[]
}

export function stringifyAs(rawValue: unknown, target: Format): ConvertResult {
  const stats: NormalizeStats = { nulls: 0, bigints: 0 }
  const value = normalize(rawValue, target, stats)
  const warnings: string[] = []
  if (target === 'toml' && stats.nulls > 0) {
    warnings.push(
      `TOML cannot represent null — ${stats.nulls} null ${stats.nulls === 1 ? 'value was' : 'values were'} omitted.`,
    )
  }
  if (stats.bigints > 0) {
    warnings.push(
      `${stats.bigints} ${stats.bigints === 1 ? 'integer exceeds' : 'integers exceed'} double precision and became ${stats.bigints === 1 ? 'a string' : 'strings'}.`,
    )
  }
  try {
    if (target === 'json') {
      return { ok: true, output: JSON.stringify(value, null, 2) ?? 'null', warnings }
    }
    if (target === 'yaml') {
      return { ok: true, output: yamlDump(value, { lineWidth: 120 }).replace(/\n$/, ''), warnings }
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return {
        ok: false,
        error: 'TOML documents must be an object (a table) at the top level.',
        warnings,
      }
    }
    return { ok: true, output: tomlStringify(value).replace(/\n$/, ''), warnings }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      warnings,
    }
  }
}
