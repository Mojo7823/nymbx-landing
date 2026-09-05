/**
 * Shared metric-definition types and the generic vector-string parser/formatter
 * used by both the v3.1 and the v4.0 modules. Pure; no DOM, no I/O.
 */

export interface MetricValue {
  /** Abbreviation as it appears in the vector string, e.g. `N`. */
  value: string
  /** Full word shown next to the abbreviation, e.g. `Network`. */
  label: string
  /** One-sentence description from the specification, used as a tooltip. */
  description: string
}

export interface MetricDefinition<K extends string = string, G extends string = string> {
  key: K
  name: string
  group: G
  values: MetricValue[]
}

/** A parse failure that names the offending segment. */
export class CvssParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CvssParseError'
  }
}

function listValues(values: MetricValue[]): string {
  const names = values.map((v) => v.value)
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

export interface ParseOptions<K extends string> {
  /** Prefixes accepted as the first segment, canonical one first (e.g. `CVSS:4.0`). */
  prefixes: string[]
  definitions: MetricDefinition<K>[]
  /** Metrics that must be present. */
  required: K[]
  /** Value assigned to metrics that are absent (always `X` here). */
  notDefined: string
}

export interface ParseResult<K extends string> {
  selection: Record<K, string>
  /** The prefix actually found, normalised to its canonical spelling. */
  prefix: string
}

/**
 * Parse a CVSS vector string. Accepts metrics in any order and any letter case,
 * rejects unknown metrics, invalid values, duplicates and missing required
 * metrics, and always names the offending 1-based segment.
 */
export function parseVector<K extends string>(
  input: string,
  { prefixes, definitions, required, notDefined }: ParseOptions<K>,
): ParseResult<K> {
  const raw = input.trim()
  if (!raw) throw new CvssParseError('Enter a CVSS vector string.')

  const segments = raw.split('/')
  const head = segments[0].toUpperCase()
  const prefix = prefixes.find((p) => p.toUpperCase() === head)
  if (!prefix) {
    throw new CvssParseError(
      `Segment 1 is "${segments[0]}" — the vector must start with ${prefixes
        .map((p) => `"${p}"`)
        .join(' or ')}.`,
    )
  }

  const byKey = new Map(definitions.map((d) => [d.key.toUpperCase(), d]))
  const selection = Object.fromEntries(definitions.map((d) => [d.key, notDefined])) as Record<
    K,
    string
  >
  const seen = new Set<string>()

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]
    const position = i + 1
    if (segment === '' && i === segments.length - 1) continue // tolerate a trailing slash
    const colon = segment.indexOf(':')
    if (colon <= 0 || colon === segment.length - 1) {
      throw new CvssParseError(
        `Segment ${position} is "${segment}" — expected a "Metric:Value" pair.`,
      )
    }
    const key = segment.slice(0, colon).toUpperCase()
    const value = segment.slice(colon + 1)

    const definition = byKey.get(key)
    if (!definition) {
      throw new CvssParseError(
        `Unknown metric "${segment.slice(0, colon)}" in segment ${position}.`,
      )
    }
    if (seen.has(definition.key)) {
      throw new CvssParseError(`Duplicate metric "${definition.key}" in segment ${position}.`)
    }
    seen.add(definition.key)

    const match = definition.values.find((v) => v.value.toUpperCase() === value.toUpperCase())
    if (!match) {
      throw new CvssParseError(
        `Invalid value "${value}" for metric ${definition.key} in segment ${position} — expected ${listValues(
          definition.values,
        )}.`,
      )
    }
    selection[definition.key] = match.value
  }

  const missing = required.filter((key) => !seen.has(key))
  if (missing.length > 0) {
    throw new CvssParseError(
      `Missing required ${missing.length === 1 ? 'metric' : 'metrics'} ${missing.join(', ')}.`,
    )
  }

  return { selection, prefix }
}

/**
 * Render the canonical vector string: the prefix followed by the metrics in
 * definition order, omitting anything left "not defined".
 */
export function formatVector<K extends string>(
  prefix: string,
  definitions: MetricDefinition<K>[],
  selection: Record<K, string>,
  notDefined: string,
): string {
  const parts = definitions
    .filter((d) => selection[d.key] !== notDefined)
    .map((d) => `${d.key}:${selection[d.key]}`)
  return [prefix, ...parts].join('/')
}
