export type FormValue = string | boolean | string[]

export interface FormField {
  name: string
  label: string
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'unsupported'
  value: FormValue
  readOnly: boolean
  required: boolean
  multiline?: boolean
  password?: boolean
  maxLength?: number
  options?: string[]
  multiselect?: boolean
  editable?: boolean
  reason?: string
}

export interface FormSummary {
  pageCount: number
  fields: FormField[]
  warnings: string[]
  canFlatten: boolean
}

export interface FillRequest {
  values: Record<string, FormValue>
  flatten: boolean
  fontBytes?: Uint8Array
}
