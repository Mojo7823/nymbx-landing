/**
 * Validation result shape and its plain-text report.
 *
 * Kept apart from `validate.ts` on purpose: the UI needs these types and
 * `formatReport`, and importing them must not drag Ajv or the bundled schemas
 * into the page chunk — they belong to the worker alone.
 */

export interface ValidationError {
  /** JSON Pointer into the document, e.g. `/components/0/type`. */
  path: string
  message: string
  keyword: string
}

export interface ValidationResult {
  /** Human label of the schema used, e.g. `CycloneDX 1.6`; `null` when none applied. */
  schema: string | null
  /** `null` when the document was not validated at all (XML, unknown version). */
  valid: boolean | null
  /** Capped at `MAX_ERRORS`. */
  errors: ValidationError[]
  /** Total errors reported by Ajv, before the cap. */
  totalErrors: number
  /** Why the document was not validated, when `valid` is `null`. */
  note?: string
}

export const MAX_ERRORS = 200

/** `path — message` lines, for the "Copy report" button. */
export function formatReport(result: ValidationResult): string {
  const header =
    result.valid === null
      ? `Not validated${result.note ? ` — ${result.note}` : ''}`
      : result.valid
        ? `Valid against the ${result.schema} schema`
        : `${result.totalErrors} schema ${result.totalErrors === 1 ? 'error' : 'errors'} against the ${result.schema} schema`
  const lines = result.errors.map((e) => `${e.path} — ${e.message} [${e.keyword}]`)
  if (result.totalErrors > result.errors.length) {
    lines.push(`… ${result.totalErrors - result.errors.length} more not shown`)
  }
  return [header, ...lines].join('\n')
}
