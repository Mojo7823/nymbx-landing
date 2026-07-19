import Papa, { type ParseError } from 'papaparse'

export type Delimiter = 'auto' | ',' | '\t' | ';' | '|'

export interface TablePreview {
  headers: string[]
  rows: string[][]
  totalRows: number
}

export interface Conversion {
  blob: Blob
  text?: string
  preview: TablePreview
  delimiter: string
}

const PREVIEW_ROWS = 20
const INLINE_LIMIT = 2 * 1024 * 1024

function usefulErrors(errors: ParseError[]) {
  return errors.filter((error) => error.code !== 'UndetectableDelimiter')
}

function errorMessage(error: ParseError) {
  return `${error.message}${error.row === undefined ? '' : ` (row ${error.row + 1})`}`
}

function headersFor(rows: string[][]) {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  return Array.from({ length: width }, (_, index) => `Column ${index + 1}`)
}

function rowValues(row: unknown, headers: string[]) {
  if (Array.isArray(row)) return row.map(String)
  const record = row as Record<string, unknown>
  return headers.map((header) => String(record[header] ?? ''))
}

function previewOf(rows: unknown[], headers: string[]): TablePreview {
  return {
    headers,
    rows: rows.slice(0, PREVIEW_ROWS).map((row) => rowValues(row, headers)),
    totalRows: rows.length,
  }
}

export function csvToJson(text: string, header: boolean, delimiter: Delimiter): Conversion {
  const result = Papa.parse<Record<string, string> | string[]>(text, {
    delimiter: delimiter === 'auto' ? '' : delimiter,
    header,
    skipEmptyLines: 'greedy',
  })
  const errors = usefulErrors(result.errors)
  if (errors[0]) throw new Error(errorMessage(errors[0]))

  const rows = result.data
  const headers = header ? (result.meta.fields ?? []) : headersFor(rows as string[][])
  const output = JSON.stringify(rows, null, 2)
  return {
    blob: new Blob([output], { type: 'application/json' }),
    text: output,
    preview: previewOf(rows, headers),
    delimiter: result.meta.delimiter,
  }
}

function scalar(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return JSON.stringify(value)
}

export function jsonToCsv(text: string, header: boolean, delimiter: Exclude<Delimiter, 'auto'>) {
  const value: unknown = JSON.parse(text)
  if (!Array.isArray(value)) throw new Error('JSON must be an array of objects or arrays.')

  let fields: string[]
  let data: Record<string, string | number | boolean>[]
  if (value.every((row) => Array.isArray(row))) {
    const width = value.reduce((max, row) => Math.max(max, row.length), 0)
    fields = Array.from({ length: width }, (_, index) => `Column ${index + 1}`)
    data = value.map((row) => Object.fromEntries(fields.map((field, i) => [field, scalar(row[i])])))
  } else if (value.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) {
    fields = [...new Set(value.flatMap((row) => Object.keys(row as Record<string, unknown>)))]
    data = value.map((row) =>
      Object.fromEntries(
        fields.map((field) => [field, scalar((row as Record<string, unknown>)[field])]),
      ),
    )
  } else {
    throw new Error('Every JSON row must use the same shape: all objects or all arrays.')
  }

  if (fields.length === 0) throw new Error('JSON rows must contain at least one column.')
  const output = Papa.unparse({ fields, data }, { delimiter, header, escapeFormulae: true })
  return {
    blob: new Blob([output], { type: 'text/csv;charset=utf-8' }),
    text: output,
    preview: previewOf(data, fields),
    delimiter,
  } satisfies Conversion
}

export function csvFileToJson(
  file: File,
  header: boolean,
  delimiter: Delimiter,
  onProgress: (value: number) => void,
): Promise<Conversion> {
  return new Promise((resolve, reject) => {
    const parts: BlobPart[] = ['[\n']
    const previewRows: unknown[] = []
    let totalRows = 0
    let fields: string[] = []
    let detected = ','

    Papa.parse<Record<string, string> | string[]>(file, {
      delimiter: delimiter === 'auto' ? '' : delimiter,
      header,
      skipEmptyLines: 'greedy',
      // 1 MB main-thread chunks; move parsing to our own worker if a chunk janks.
      chunkSize: 1024 * 1024,
      chunk(result, parser) {
        const errors = usefulErrors(result.errors)
        if (errors[0]) {
          parser.abort()
          reject(new Error(errorMessage(errors[0])))
          return
        }
        detected = result.meta.delimiter
        if (header && result.meta.fields) fields = result.meta.fields
        const rows = result.data
        if (!header) {
          const width = headersFor(rows as string[][]).length
          while (fields.length < width) fields.push(`Column ${fields.length + 1}`)
        }
        if (rows.length > 0) {
          if (totalRows > 0) parts.push(',\n')
          parts.push(rows.map((row) => JSON.stringify(row)).join(',\n'))
          previewRows.push(...rows.slice(0, PREVIEW_ROWS - previewRows.length))
          totalRows += rows.length
        }
        onProgress(Math.min(1, result.meta.cursor / Math.max(file.size, 1)))
      },
      complete() {
        parts.push(totalRows > 0 ? '\n]' : ']')
        const blob = new Blob(parts, { type: 'application/json' })
        const conversion: Conversion = {
          blob,
          preview: {
            headers: fields,
            rows: previewRows.map((row) => rowValues(row, fields)),
            totalRows,
          },
          delimiter: detected,
        }
        onProgress(1)
        if (blob.size <= INLINE_LIMIT) {
          void blob.text().then((text) => resolve({ ...conversion, text }), reject)
        } else {
          resolve(conversion)
        }
      },
      error(error) {
        reject(error)
      },
    })
  })
}
