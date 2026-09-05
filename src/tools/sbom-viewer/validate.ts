/**
 * JSON-schema validation against the bundled CycloneDX and SPDX schemas.
 *
 * Runs inside `sbom.worker.ts` (and in Node for its unit tests). Ajv compiles
 * schemas with `new Function`; the site sends no Content-Security-Policy
 * today, so that is fine — a future CSP would need `'unsafe-eval'` here, or
 * Ajv's standalone precompilation instead.
 *
 * Nothing is fetched: every schema is a committed JSON file (see
 * `schemas/SOURCES.md`) pulled in through a dynamic import, so Vite emits one
 * lazily loaded chunk per schema.
 */
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'
import { MAX_ERRORS, type ValidationError, type ValidationResult } from './report'

export type { ValidationError, ValidationResult } from './report'

export type SchemaId = 'bom-1.2' | 'bom-1.3' | 'bom-1.4' | 'bom-1.5' | 'bom-1.6' | 'spdx-2.3'

/**
 * Schema for a detected format + version, or `null` when none is bundled.
 * SPDX 2.2 documents are checked against the 2.3 schema (they validate in
 * practice) — the label says so.
 */
export function schemaFor(
  format: 'CycloneDX' | 'SPDX',
  specVersion: string,
): { id: SchemaId; label: string } | null {
  if (format === 'CycloneDX') {
    const version = specVersion.trim()
    if (['1.2', '1.3', '1.4', '1.5', '1.6'].includes(version)) {
      return { id: `bom-${version}` as SchemaId, label: `CycloneDX ${version}` }
    }
    return null
  }
  const version = specVersion.trim().replace(/^SPDX-/, '')
  if (version === '2.2' || version === '2.3') {
    return { id: 'spdx-2.3', label: 'SPDX 2.3' }
  }
  return null
}

type JsonSchema = Record<string, unknown>

/** Vite needs literal specifiers to emit a chunk per schema. */
async function loadSchema(id: SchemaId): Promise<JsonSchema> {
  switch (id) {
    case 'bom-1.2':
      return (await import('./schemas/bom-1.2.schema.json')).default as JsonSchema
    case 'bom-1.3':
      return (await import('./schemas/bom-1.3.schema.json')).default as JsonSchema
    case 'bom-1.4':
      return (await import('./schemas/bom-1.4.schema.json')).default as JsonSchema
    case 'bom-1.5':
      return (await import('./schemas/bom-1.5.schema.json')).default as JsonSchema
    case 'bom-1.6':
      return (await import('./schemas/bom-1.6.schema.json')).default as JsonSchema
    case 'spdx-2.3':
      return (await import('./schemas/spdx-2.3.schema.json')).default as JsonSchema
  }
}

let ajvPromise: Promise<Ajv> | null = null

/**
 * One Ajv instance for the whole worker, with the two schemas the CycloneDX
 * BOM schemas `$ref` by relative URL already registered.
 */
function getAjv(): Promise<Ajv> {
  ajvPromise ??= (async () => {
    // `strict: false` is required: the CycloneDX schemas use `$comment`,
    // `examples`, `deprecated`, `meta:enum` and `x-trust-boundary`, all of
    // which strict mode rejects.
    // `logger: false`: upstream bom-1.2 declares a non-existent `"format":
    // "string"` four times, which Ajv would otherwise warn about on every
    // validation. Nothing else is ever logged.
    const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: true, logger: false })
    addFormats(ajv)
    // ajv-formats has no `iri-reference`/`idn-email`. Registering them as
    // always-passing keeps the rest of the document checked: we promise
    // structural validation, not IRI/IDN grammar.
    ajv.addFormat('iri-reference', true)
    ajv.addFormat('idn-email', true)
    const [spdxIds, jsf] = await Promise.all([
      import('./schemas/spdx.schema.json'),
      import('./schemas/jsf-0.82.schema.json'),
    ])
    ajv.addSchema(spdxIds.default as JsonSchema)
    ajv.addSchema(jsf.default as JsonSchema)
    return ajv
  })()
  return ajvPromise
}

const validators = new Map<SchemaId, Promise<ValidateFunction>>()

/** Compiling the 1.6 schema costs a few hundred ms — cache per spec version. */
function getValidator(id: SchemaId): Promise<ValidateFunction> {
  let cached = validators.get(id)
  if (!cached) {
    cached = (async () => {
      const [ajv, schema] = await Promise.all([getAjv(), loadSchema(id)])
      return ajv.compile(relaxObjectUniqueness(schema))
    })()
    validators.set(id, cached)
  }
  return cached
}

type Json = Record<string, unknown>

function resolveLocalRef(root: Json, ref: string): unknown {
  if (!ref.startsWith('#/')) return null
  return ref
    .slice(2)
    .split('/')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object'
          ? (node as Json)[key.replace(/~1/g, '/').replace(/~0/g, '~')]
          : undefined,
      root,
    )
}

/** Does this (sub)schema describe objects? Follows local `$ref`s and unions. */
function describesObjects(schema: unknown, root: Json, depth = 0): boolean {
  if (!schema || typeof schema !== 'object' || depth > 8) return false
  const s = schema as Json
  if (s.type === 'object' || s.properties) return true
  if (typeof s.type === 'string') return false
  if (typeof s.$ref === 'string')
    return describesObjects(resolveLocalRef(root, s.$ref), root, depth + 1)
  return ['oneOf', 'anyOf', 'allOf'].some(
    (k) =>
      Array.isArray(s[k]) && (s[k] as unknown[]).some((b) => describesObjects(b, root, depth + 1)),
  )
}

/** Object arrays whose duplicates we detect ourselves after Ajv ran. */
const DUPLICATE_SCAN_PATHS: readonly string[] = [
  'components',
  'services',
  'dependencies',
  'vulnerabilities',
]

/**
 * Ajv implements `uniqueItems` on arrays of objects as a pairwise deep
 * comparison — O(n²): a 10 000-component SBOM took 11 s to validate against
 * bom-1.6, 5 000 took 3 s. The keyword cannot be disabled in Ajv 8, so it is
 * removed from the schema wherever the items are objects (scalar arrays such
 * as `dependsOn` keep it), and `findDuplicateObjects` reports duplicates in
 * the arrays that matter in O(n) instead. Works on a deep copy; the imported
 * schema module is never mutated.
 */
export function relaxObjectUniqueness<T extends Json>(schema: T): T {
  const copy = structuredClone(schema)
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    const s = node as Json
    if (s.uniqueItems === true && describesObjects(s.items, copy)) delete s.uniqueItems
    Object.values(s).forEach(walk)
  }
  walk(copy)
  return copy
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v as Json)
            .sort()
            .map((k) => [k, (v as Json)[k]]),
        )
      : v,
  )
}

/**
 * Ajv-shaped `uniqueItems` errors for duplicate objects in the arrays named in
 * DUPLICATE_SCAN_PATHS, at the top level and inside nested `components`.
 */
export function findDuplicateObjects(data: unknown): ErrorObject[] {
  const errors: ErrorObject[] = []
  const scan = (array: unknown, path: string) => {
    if (!Array.isArray(array)) return
    const seen = new Map<string, number>()
    array.forEach((item, i) => {
      if (!item || typeof item !== 'object') return
      const key = canonical(item)
      const first = seen.get(key)
      if (first === undefined) seen.set(key, i)
      else {
        errors.push({
          instancePath: path,
          schemaPath: '#/uniqueItems',
          keyword: 'uniqueItems',
          params: { i, j: first },
          message: `must NOT have duplicate items (items ## ${i} and ${first} are identical)`,
        })
      }
    })
  }
  const visit = (node: unknown, path: string, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 32) return
    const obj = node as Json
    for (const key of DUPLICATE_SCAN_PATHS) {
      if (Array.isArray(obj[key])) {
        scan(obj[key], `${path}/${key}`)
        if (key === 'components') {
          ;(obj[key] as unknown[]).forEach((child, i) =>
            visit(child, `${path}/${key}/${i}`, depth + 1),
          )
        }
      }
    }
  }
  visit(data, '', 0)
  return errors
}

export function mapErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
  return (errors ?? []).slice(0, MAX_ERRORS).map((error) => ({
    path: error.instancePath || '/',
    message: error.message ?? 'is invalid',
    keyword: error.keyword,
  }))
}

/** Validate a parsed document; never throws — a broken schema becomes a note. */
export async function validateDocument(
  data: unknown,
  format: 'CycloneDX' | 'SPDX',
  specVersion: string,
): Promise<ValidationResult> {
  const schema = schemaFor(format, specVersion)
  if (!schema) {
    return {
      schema: null,
      valid: null,
      errors: [],
      totalErrors: 0,
      note: `no bundled schema for ${format} ${specVersion || '(version missing)'}`,
    }
  }
  try {
    const validate = await getValidator(schema.id)
    const ajvValid = validate(data)
    const errors = [...(validate.errors ?? []), ...findDuplicateObjects(data)]
    const valid = ajvValid && errors.length === 0
    return {
      schema: schema.label,
      valid,
      errors: mapErrors(errors),
      totalErrors: errors.length,
    }
  } catch (error) {
    return {
      schema: schema.label,
      valid: null,
      errors: [],
      totalErrors: 0,
      note: `the ${schema.label} schema could not be compiled (${error instanceof Error ? error.message : 'unknown error'})`,
    }
  }
}
