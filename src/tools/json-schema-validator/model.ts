export type Draft = 'auto' | 'draft-07' | '2019-09' | '2020-12'

export const MAX_INPUT_BYTES = 2 * 1024 * 1024

export interface ValidationIssue {
  instancePath: string
  schemaPath: string
  keyword: string
  message: string
}

export type ValidationResult =
  | {
      ok: true
      valid: boolean
      draft: Exclude<Draft, 'auto'>
      errors: ValidationIssue[]
      totalErrors: number
    }
  | {
      ok: false
      source: 'schema' | 'instance'
      message: string
      errors: ValidationIssue[]
    }
