import { useState } from 'react'
import { ArrowLeftRight, Download, Sparkles } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { FileDropzone } from '../../components/FileDropzone'
import { ProgressBar } from '../../components/ProgressBar'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { csvFileToJson, csvToJson, jsonToCsv, type Conversion, type Delimiter } from './convert'

type Direction = 'csv-json' | 'json-csv'

const SAMPLES: Record<Direction, string> = {
  'csv-json':
    'name,role,note\nAda Lovelace,Engineer,"First programmer, mathematician"\nGrace Hopper,Admiral,"COBOL pioneer\nand compiler builder"',
  'json-csv':
    '[\n  { "name": "Ada Lovelace", "role": "Engineer" },\n  { "name": "Grace Hopper", "active": true }\n]',
}

const DELIMITERS: { value: Delimiter; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  { value: ',', label: 'Comma' },
  { value: '\t', label: 'Tab' },
  { value: ';', label: 'Semicolon' },
  { value: '|', label: 'Pipe' },
]

function delimiterName(delimiter: string) {
  return delimiter === '\t' ? 'tab' : delimiter === ',' ? 'comma' : delimiter
}

export default function CsvJson() {
  const [direction, setDirection] = useState<Direction>('csv-json')
  const [text, setText] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [delimiter, setDelimiter] = useState<Delimiter>('auto')
  const [header, setHeader] = useState(true)
  const [result, setResult] = useState<Conversion | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function reset(nextDirection = direction) {
    setDirection(nextDirection)
    setText('')
    setSourceName('')
    setResult(null)
    setError(null)
    setProgress(0)
    if (nextDirection === 'json-csv' && delimiter === 'auto') setDelimiter(',')
  }

  async function openFile(file: File | undefined) {
    if (!file) return
    setSourceName(file.name)
    setResult(null)
    setError(null)
    if (direction === 'json-csv') {
      setText(await file.text())
      return
    }
    setText('')
    setBusy(true)
    try {
      setResult(await csvFileToJson(file, header, delimiter, setProgress))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not parse this CSV file.')
    } finally {
      setBusy(false)
    }
  }

  function convert() {
    setError(null)
    try {
      setResult(
        direction === 'csv-json'
          ? csvToJson(text, header, delimiter)
          : jsonToCsv(text, header, delimiter === 'auto' ? ',' : delimiter),
      )
    } catch (cause) {
      setResult(null)
      setError(cause instanceof Error ? cause.message : 'Conversion failed.')
    }
  }

  const outputName = direction === 'csv-json' ? 'converted.json' : 'converted.csv'
  const inputLabel = direction === 'csv-json' ? 'CSV input' : 'JSON input'
  const shownHeaders = result?.preview.headers.slice(0, 20) ?? []

  return (
    <ToolLayout
      title="CSV ↔ JSON"
      description="Convert tabular data in either direction with delimiter detection and a live preview. CSV files stream in chunks; nothing leaves your browser."
      badge="client-side"
    >
      <div role="tablist" aria-label="Conversion direction" className="mb-4 flex gap-1">
        {(
          [
            ['csv-json', 'CSV → JSON'],
            ['json-csv', 'JSON → CSV'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={direction === value}
            onClick={() => reset(value)}
            className={cx(
              'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              direction === value ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-soft p-3">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
          Delimiter
          <select
            name="delimiter"
            value={delimiter}
            onChange={(event) => setDelimiter(event.target.value as Delimiter)}
            className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
          >
            {DELIMITERS.filter((item) => direction === 'csv-json' || item.value !== 'auto').map(
              (item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted">
          <input
            name="header"
            type="checkbox"
            checked={header}
            onChange={(event) => setHeader(event.target.checked)}
            className="accent-pine"
          />
          {direction === 'csv-json' ? 'First CSV row is a header' : 'Include header row'}
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <textarea
            name="input"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setSourceName('')
              setResult(null)
            }}
            placeholder={`Paste ${direction === 'csv-json' ? 'CSV' : 'a JSON array'} here…`}
            aria-label={inputLabel}
            spellCheck={false}
            className="h-64 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={convert} disabled={!text.trim() || busy}>
              <ArrowLeftRight className="size-4" />
              Convert
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setText(SAMPLES[direction])
                setSourceName('')
                setResult(null)
              }}
            >
              <Sparkles className="size-3.5" />
              Load sample
            </Button>
          </div>
        </div>

        <div className="min-w-0">
          {busy ? (
            <ProgressBar label="Streaming CSV" value={progress * 100} />
          ) : sourceName ? (
            <div className="rounded-lg border border-line bg-card p-4">
              <p className="truncate text-sm font-medium text-ink">{sourceName}</p>
              <p className="mt-1 text-xs text-muted">File loaded locally.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => reset()}>
                Choose another
              </Button>
            </div>
          ) : (
            <FileDropzone
              accept={
                direction === 'csv-json'
                  ? '.csv,.tsv,text/csv,text/tab-separated-values'
                  : '.json,application/json'
              }
              onFiles={(files) => void openFile(files[0])}
              hint={
                direction === 'csv-json'
                  ? 'CSV or TSV — large files stream in chunks'
                  : 'JSON array of objects or arrays'
              }
            />
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-line bg-rose-soft p-3 text-sm text-rose"
        >
          {error}
        </p>
      )}

      {result && (
        <section className="mt-6 border-t border-line pt-5" aria-labelledby="preview-heading">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 id="preview-heading" className="mr-auto text-sm font-semibold text-ink">
              Preview
            </h2>
            <span className="font-mono text-[11px] text-muted tabular-nums">
              {result.preview.totalRows.toLocaleString()} rows · {result.preview.headers.length}{' '}
              columns · {delimiterName(result.delimiter)} · {formatBytes(result.blob.size)}
            </span>
            {result.text !== undefined && <CopyButton text={result.text} />}
            <Button size="sm" onClick={() => downloadBlob(result.blob, outputName)}>
              <Download className="size-3.5" />
              Download {outputName.endsWith('json') ? 'JSON' : 'CSV'}
            </Button>
          </div>
          <div className="max-h-96 overflow-auto rounded-lg border border-line bg-card">
            <table className="w-max min-w-full border-collapse text-left font-mono text-xs">
              <thead className="sticky top-0 bg-soft text-ink">
                <tr>
                  {shownHeaders.map((field, index) => (
                    <th
                      key={`${field}-${index}`}
                      className="border-r border-b border-line px-3 py-2 font-semibold whitespace-nowrap last:border-r-0"
                    >
                      {field}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {shownHeaders.map((_, colIndex) => (
                      <td
                        key={colIndex}
                        className="max-w-64 truncate border-r border-b border-line px-3 py-2 text-muted last:border-r-0"
                      >
                        {row[colIndex] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(result.preview.totalRows > 20 || result.preview.headers.length > 20) && (
            <p className="mt-2 text-xs text-muted">
              Preview is limited to the first 20 rows and columns; the download contains everything.
            </p>
          )}
        </section>
      )}
    </ToolLayout>
  )
}
