import Ajv, { MissingRefError } from 'ajv'
import type { ErrorObject, Options } from 'ajv'
import Ajv2019 from 'ajv/dist/2019'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describeJsonError } from '../sbom-viewer/detect'
import { MAX_INPUT_BYTES } from './model'
import type { Draft, ValidationIssue, ValidationResult } from './model'

type ResolvedDraft = Exclude<Draft, 'auto'>

const META_SCHEMAS: Record<ResolvedDraft, string> = {
  'draft-07': 'http://json-schema.org/draft-07/schema',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
}
const MAX_ERRORS = 100

function declaredDraft(uri: unknown): ResolvedDraft | null {
  if (typeof uri !== 'string') return null
  const match =
    /^https?:\/\/json-schema\.org\/(draft-07|draft\/2019-09|draft\/2020-12)\/schema#?$/.exec(uri)
  if (!match) return null
  return match[1].replace('draft/', '') as ResolvedDraft
}

function issues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).slice(0, MAX_ERRORS).map((error) => {
    let instancePath = error.instancePath
    const property: unknown =
      error.keyword === 'required'
        ? error.params.missingProperty
        : error.keyword === 'additionalProperties'
          ? error.params.additionalProperty
          : error.keyword === 'unevaluatedProperties'
            ? error.params.unevaluatedProperty
            : undefined
    if (typeof property === 'string') {
      instancePath += `/${property.replace(/~/g, '~0').replace(/\//g, '~1')}`
    }
    return {
      instancePath,
      schemaPath: error.schemaPath,
      keyword: error.keyword,
      message: error.message ?? 'Validation failed.',
    }
  })
}

function failure(
  source: 'schema' | 'instance',
  message: string,
  errors: ErrorObject[] | null = null,
): ValidationResult {
  return { ok: false, source, message, errors: issues(errors) }
}

/** Synchronous and local-only; callers run this in a disposable, time-limited worker. */
export function validateJsonSchema(
  schemaText: string,
  instanceText: string,
  draft: Draft,
): ValidationResult {
  if (new Blob([schemaText]).size > MAX_INPUT_BYTES) {
    return failure('schema', 'Schema exceeds the 2 MiB input limit.')
  }
  if (new Blob([instanceText]).size > MAX_INPUT_BYTES) {
    return failure('instance', 'JSON document exceeds the 2 MiB input limit.')
  }

  let schema: unknown
  try {
    schema = JSON.parse(schemaText)
  } catch (error) {
    return failure('schema', `Schema is not valid JSON: ${describeJsonError(error, schemaText)}`)
  }
  if (
    typeof schema !== 'boolean' &&
    (!schema || typeof schema !== 'object' || Array.isArray(schema))
  ) {
    return failure('schema', 'A JSON Schema must be an object or a boolean (true or false).')
  }

  const schemaObject = typeof schema === 'boolean' ? null : (schema as Record<string, unknown>)
  let selected: ResolvedDraft = draft === 'auto' ? 'draft-07' : draft
  if (schemaObject && Object.hasOwn(schemaObject, '$schema')) {
    const declared = declaredDraft(schemaObject.$schema)
    if (!declared) {
      return failure(
        'schema',
        'Unsupported $schema. Use JSON Schema draft-07, 2019-09, or 2020-12; custom metaschemas are not loaded.',
      )
    }
    if (draft !== 'auto' && draft !== declared) {
      return failure(
        'schema',
        `Selected ${draft} conflicts with the schema’s declared ${declared} dialect.`,
      )
    }
    selected = declared
    // Ajv registers canonical meta IDs; accept the equivalent HTTP/HTTPS and trailing-# spellings.
    schemaObject.$schema = META_SCHEMAS[selected]
  }

  let instance: unknown
  try {
    instance = JSON.parse(instanceText)
  } catch (error) {
    return failure(
      'instance',
      `Document is not valid JSON: ${describeJsonError(error, instanceText)}`,
    )
  }

  let ajv: Ajv | Ajv2019 | Ajv2020 | undefined
  try {
    const options: Options = {
      allErrors: true,
      strict: false,
      strictSchema: true,
      strictNumbers: true,
      validateFormats: true,
      ownProperties: true,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
      logger: false,
    }
    // Never share compiled user schemas: repeated $id values must not retain earlier rules.
    ajv =
      selected === '2020-12'
        ? new Ajv2020(options)
        : selected === '2019-09'
          ? new Ajv2019(options)
          : new Ajv(options)
    addFormats(ajv)
    // No loadSchema or compileAsync: references may resolve only within this schema.
    const validate = ajv.compile(schema as boolean | Record<string, unknown>)
    if ('$async' in validate && validate.$async) {
      return failure(
        'schema',
        'Asynchronous schemas ($async) are not supported. Use synchronous validation keywords and formats.',
      )
    }
    const valid = validate(instance)
    return {
      ok: true,
      valid,
      draft: selected,
      errors: issues(validate.errors),
      totalErrors: validate.errors?.length ?? 0,
    }
  } catch (error) {
    if (error instanceof MissingRefError) {
      return failure(
        'schema',
        `Cannot resolve reference "${error.missingRef}". Validation is local-only: remote schemas are not downloaded. Inline referenced schemas using $defs or definitions and local $ref pointers.`,
      )
    }
    const message =
      error instanceof Error ? error.message : 'The schema could not be compiled or evaluated.'
    return failure('schema', `Schema validation could not run: ${message}`, ajv?.errors)
  }
}
