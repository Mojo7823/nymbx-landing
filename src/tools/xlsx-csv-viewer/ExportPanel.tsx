import { useId, useState } from 'react'
import { Download, FileArchive } from 'lucide-react'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import {
  defaultExportOptions,
  type CsvDelimiter,
  type ExportFormat,
  type ExportOptions,
} from './exportOptions'

export interface ExportPanelProps {
  sheetName: string
  /** More than one sheet unlocks the zip button. */
  sheetCount: number
  /**
   * Sheet row indices in display order when a search or sort is active,
   * otherwise null (the "current view" option is then meaningless).
   */
  viewRowIndices: number[] | null
  busy: boolean
  onExport: (opts: ExportOptions) => void
  onExportAll: (opts: Omit<ExportOptions, 'format' | 'rowIndices'>) => void
}

const formats: [ExportFormat, string][] = [
  ['csv', 'CSV'],
  ['json-objects', 'JSON — array of objects (header row = keys)'],
  ['json-arrays', 'JSON — array of arrays'],
]

const delimiters: [CsvDelimiter, string][] = [
  [',', 'Comma (,)'],
  [';', 'Semicolon (;)'],
  ['\t', 'Tab'],
  ['|', 'Pipe (|)'],
]

const radio = 'flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink'
const radioInput = 'size-3.5 accent-(--color-pine)'
const legend = 'text-xs font-medium text-muted'

export function ExportPanel({
  sheetName,
  sheetCount,
  viewRowIndices,
  busy,
  onExport,
  onExportAll,
}: ExportPanelProps) {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>(defaultExportOptions.format)
  const [scope, setScope] = useState<'sheet' | 'view'>('sheet')
  const [values, setValues] = useState<ExportOptions['values']>(defaultExportOptions.values)
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(defaultExportOptions.delimiter)
  const [quoteAll, setQuoteAll] = useState(defaultExportOptions.quoteAll)
  const [bom, setBom] = useState(defaultExportOptions.bom)

  const group = useId()
  const panelId = `${group}-panel`
  const isCsv = format === 'csv'
  // A view that is neither filtered nor sorted is the whole sheet anyway.
  const useView = scope === 'view' && viewRowIndices !== null

  function options(): ExportOptions {
    return {
      format,
      values,
      delimiter,
      quoteAll,
      bom,
      rowIndices: useView ? (viewRowIndices ?? undefined) : undefined,
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Download className="size-3.5" />
        Export…
      </Button>

      {open && (
        <div
          id={panelId}
          className="w-full rounded-lg border border-line bg-card p-3 sm:p-4"
          role="group"
          aria-label="Export options"
        >
          <div className="flex flex-col gap-3">
            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <legend className={cx(legend, 'float-left mr-4')}>Format</legend>
              {formats.map(([value, label]) => (
                <label key={value} className={radio}>
                  <input
                    type="radio"
                    name={`${group}-format`}
                    checked={format === value}
                    onChange={() => setFormat(value)}
                    className={radioInput}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <legend className={cx(legend, 'float-left mr-4')}>Rows</legend>
              <label className={radio}>
                <input
                  type="radio"
                  name={`${group}-scope`}
                  checked={!useView}
                  onChange={() => setScope('sheet')}
                  className={radioInput}
                />
                Whole sheet
              </label>
              <label
                className={cx(radio, viewRowIndices === null && 'cursor-not-allowed opacity-50')}
              >
                <input
                  type="radio"
                  name={`${group}-scope`}
                  checked={useView}
                  disabled={viewRowIndices === null}
                  onChange={() => setScope('view')}
                  className={radioInput}
                />
                {viewRowIndices === null
                  ? 'Current view — search or sort the grid first'
                  : `Current view — ${viewRowIndices.length.toLocaleString()} rows (sorted / filtered as shown)`}
              </label>
            </fieldset>

            <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <legend className={cx(legend, 'float-left mr-4')}>Values</legend>
              {(
                [
                  ['typed', 'Typed (numbers, TRUE/FALSE, ISO dates)'],
                  ['display', 'As displayed (formatted text)'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className={radio}>
                  <input
                    type="radio"
                    name={`${group}-values`}
                    checked={values === value}
                    onChange={() => setValues(value)}
                    className={radioInput}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            {isCsv && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted">
                  Delimiter
                  <select
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.target.value as CsvDelimiter)}
                    className="h-8 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
                  >
                    {delimiters.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={radio}>
                  <input
                    type="checkbox"
                    checked={quoteAll}
                    onChange={(e) => setQuoteAll(e.target.checked)}
                    className={radioInput}
                  />
                  Quote every field
                </label>
                <label className={radio}>
                  <input
                    type="checkbox"
                    checked={bom}
                    onChange={(e) => setBom(e.target.checked)}
                    className={radioInput}
                  />
                  UTF-8 BOM (helps Excel read accents and CJK)
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={busy} onClick={() => onExport(options())}>
                <Download className="size-3.5" />
                Download {sheetName}
              </Button>
              {sheetCount > 1 && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => onExportAll({ values, delimiter, quoteAll, bom })}
                >
                  <FileArchive className="size-3.5" />
                  All sheets as zip of CSVs
                </Button>
              )}
            </div>

            {busy && <ProgressBar label="Exporting…" />}

            <p className="text-[11px] text-faint">
              Formulas export their last computed value; dates as ISO 8601.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
