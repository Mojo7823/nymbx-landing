import { useEffect, useMemo, useRef, useState } from 'react'
import { transfer } from 'comlink'
import { ArrowDown, ArrowUp, Check, Copy, Trash2 } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { toast } from '../../lib/toast'
import { wrapWorker, type WorkerHandle } from '../../lib/worker'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import {
  buildTsv,
  colLabel,
  filterIndices,
  sortIndices,
  visibleRange,
  type SortDir,
} from './gridMath'
import { ExportPanel } from './ExportPanel'
import { fileStem, safeSheetFileName, type ExportOptions } from './exportOptions'
import type { SheetMeta, SheetWorkerApi } from './sheet.worker'

const ROW_H = 32
const COL_W = 140
const GUTTER_W = 64
const OVERSCAN = 10
/** Rendering cap — sheets wider than this show a notice. */
const MAX_COLS = 200

interface CellPos {
  r: number
  c: number
}

interface LoadedFile {
  name: string
  size: number
  sheets: SheetMeta[]
}

const ACCEPT =
  '.xlsx,.xls,.xlsm,.csv,.ods,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-excel,text/csv,application/vnd.oasis.opendocument.spreadsheet'

export default function XlsxCsvViewer() {
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [active, setActive] = useState(0)
  const [rows, setRows] = useState<string[][] | null>(null)
  const [loading, setLoading] = useState<null | 'file' | 'sheet'>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selection, setSelection] = useState<{ a: CellPos; b: CellPos } | null>(null)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(480)

  const workerRef = useRef<WorkerHandle<SheetWorkerApi> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedQuery = useDebouncedValue(query, 250)

  useEffect(
    () => () => {
      workerRef.current?.terminate()
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    },
    [],
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setViewportH(el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [file])

  function worker() {
    workerRef.current ??= wrapWorker<SheetWorkerApi>(
      new Worker(new URL('./sheet.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current.api
  }

  async function showSheet(index: number) {
    setLoading('sheet')
    setSelection(null)
    setSortCol(null)
    setQuery('')
    setScrollTop(0)
    scrollRef.current?.scrollTo(0, 0)
    try {
      setRows(await worker().getSheet(index))
      setActive(index)
    } catch {
      setError('Could not read this sheet.')
    } finally {
      setLoading(null)
    }
  }

  async function openFile(files: File[]) {
    const picked = files[0]
    if (!picked) return
    setError(null)
    setLoading('file')
    try {
      const buffer = await picked.arrayBuffer()
      const sheets = await worker().open(transfer(buffer, [buffer]))
      if (sheets.length === 0) throw new Error('empty workbook')
      setFile({ name: picked.name, size: picked.size, sheets })
      setRows(null)
      await showSheet(0)
    } catch {
      setError('Could not read this file as a spreadsheet. It may be corrupted or unsupported.')
      setLoading(null)
    }
  }

  function reset() {
    setFile(null)
    setRows(null)
    setError(null)
    setQuery('')
    setSelection(null)
    setSortCol(null)
  }

  function onHeaderClick(col: number) {
    setSelection(null)
    if (sortCol !== col) {
      setSortCol(col)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortCol(null)
    }
  }

  function onCellClick(r: number, c: number, shift: boolean) {
    setSelection((prev) =>
      shift && prev ? { a: prev.a, b: { r, c } } : { a: { r, c }, b: { r, c } },
    )
  }

  const meta = file?.sheets[active]
  const shownCols = meta ? Math.min(meta.cols, MAX_COLS) : 0

  const displayIndices = useMemo(() => {
    if (!rows) return []
    const base = debouncedQuery
      ? filterIndices(rows, debouncedQuery)
      : Array.from({ length: rows.length }, (_, i) => i)
    return sortCol !== null ? sortIndices(rows, base, sortCol, sortDir) : base
  }, [rows, debouncedQuery, sortCol, sortDir])

  const sel = useMemo(() => {
    if (!selection) return null
    return {
      r1: Math.min(selection.a.r, selection.b.r),
      r2: Math.max(selection.a.r, selection.b.r),
      c1: Math.min(selection.a.c, selection.b.c),
      c2: Math.max(selection.a.c, selection.b.c),
    }
  }, [selection])

  async function copySelection() {
    if (!sel || !rows) return
    const block: string[][] = []
    for (let r = sel.r1; r <= sel.r2; r++) {
      const src = rows[displayIndices[r]] ?? []
      const line: string[] = []
      for (let c = sel.c1; c <= sel.c2; c++) line.push(src[c] ?? '')
      block.push(line)
    }
    try {
      await navigator.clipboard.writeText(buildTsv(block))
      setCopied(true)
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Could not write to the clipboard.')
    }
  }

  /** File name for a download: "<workbook stem> - <safe sheet name>.<ext>". */
  function exportFileName(ext: string): string {
    const sheetName = file ? safeSheetFileName(file.sheets[active].name, new Set()) : 'Sheet'
    return `${fileStem(file?.name ?? 'workbook')} - ${sheetName}.${ext}`
  }

  async function runExport(job: () => Promise<{ bytes: Uint8Array; name: string; type: string }>) {
    // The button is disabled while a job runs, so exports cannot overlap.
    if (exporting) return
    setExporting(true)
    setError(null)
    try {
      const { bytes, name, type } = await job()
      // Re-wrap so the BlobPart type is exact (the worker hands back a
      // transferred Uint8Array typed over ArrayBufferLike).
      downloadBlob(new Blob([new Uint8Array(bytes)], { type }), name)
    } catch {
      toast('Could not export this sheet.', { variant: 'error' })
    } finally {
      setExporting(false)
    }
  }

  function exportSheet(opts: ExportOptions) {
    void runExport(async () => ({
      bytes: await worker().exportSheet(active, opts),
      name: exportFileName(opts.format === 'csv' ? 'csv' : 'json'),
      type: opts.format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
    }))
  }

  function exportAll(opts: Omit<ExportOptions, 'format' | 'rowIndices'>) {
    const stem = fileStem(file?.name ?? 'workbook')
    void runExport(async () => ({
      bytes: await worker().exportAllCsv(opts, stem),
      name: `${stem}-sheets.zip`,
      type: 'application/zip',
    }))
  }

  const range = visibleRange(scrollTop, viewportH, ROW_H, displayIndices.length, OVERSCAN)
  const contentWidth = GUTTER_W + shownCols * COL_W

  const cellBase =
    'shrink-0 truncate border-r border-b border-line px-2 leading-8 font-mono text-xs tabular-nums'

  return (
    <ToolLayout
      title="XLSX / CSV viewer"
      description="Open spreadsheets read-only: sheet tabs, column sort, search and copy. Formulas show their last computed value. Everything stays in your browser."
      badge="client-side"
    >
      {!file ? (
        <>
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          {loading === 'file' ? (
            <ProgressBar label="Reading spreadsheet" />
          ) : (
            <FileDropzone
              accept={ACCEPT}
              onFiles={(files) => void openFile(files)}
              hint="XLSX, XLS, CSV or ODS. Viewing only, the file is never modified"
            />
          )}
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{file.name}</p>
              <p className="font-mono text-[11px] text-muted tabular-nums">
                {file.sheets.length} {file.sheets.length === 1 ? 'sheet' : 'sheets'} ·{' '}
                {formatBytes(file.size)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <Trash2 className="size-3.5" />
              Choose another
            </Button>
          </div>

          {file.sheets.length > 1 && (
            <div
              role="tablist"
              aria-label="Sheets"
              className="mb-3 flex gap-1 overflow-x-auto rounded-md border border-line bg-card p-1"
            >
              {file.sheets.map((s, i) => (
                <button
                  key={s.name}
                  role="tab"
                  aria-selected={active === i}
                  onClick={() => void showSheet(i)}
                  className={cx(
                    'shrink-0 cursor-pointer rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
                    active === i ? 'bg-mint text-pine' : 'text-muted hover:text-ink',
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <input
              type="search"
              value={query}
              onChange={(e) => {
                // Selection coordinates live in display space — a new filter
                // invalidates them.
                setSelection(null)
                setQuery(e.target.value)
              }}
              placeholder="Search all cells…"
              aria-label="Search all cells"
              className="h-8 w-56 rounded-md border border-line-strong bg-card px-2 text-xs text-ink placeholder:text-faint focus:border-pine focus:outline-none"
            />
            <p className="font-mono text-[11px] text-muted tabular-nums" role="status">
              {meta &&
                (debouncedQuery
                  ? `${displayIndices.length.toLocaleString()} of ${meta.rows.toLocaleString()} rows match`
                  : `${meta.rows.toLocaleString()} rows × ${meta.cols.toLocaleString()} cols`)}
              {sel &&
                ` · ${((sel.r2 - sel.r1 + 1) * (sel.c2 - sel.c1 + 1)).toLocaleString()} cells selected`}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void copySelection()}
              disabled={!sel}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy selection'}
            </Button>
            <span className="text-[11px] text-faint">Click a cell, shift-click to extend</span>
            {meta && (
              <ExportPanel
                sheetName={meta.name}
                sheetCount={file.sheets.length}
                viewRowIndices={
                  debouncedQuery || sortCol !== null ? (rows ? displayIndices : []) : null
                }
                busy={exporting}
                onExport={exportSheet}
                onExportAll={exportAll}
              />
            )}
          </div>

          {meta && meta.cols > MAX_COLS && (
            <p className="mb-3 text-xs text-amber-badge" role="status">
              Showing the first {MAX_COLS} of {meta.cols.toLocaleString()} columns.
            </p>
          )}

          {error && (
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {loading === 'sheet' || !rows ? (
            <ProgressBar label="Loading sheet" />
          ) : displayIndices.length === 0 ? (
            <p className="rounded-lg border border-line bg-card p-8 text-center text-sm text-muted">
              {debouncedQuery ? 'No rows match the search.' : 'This sheet is empty.'}
            </p>
          ) : (
            <div
              ref={scrollRef}
              tabIndex={0}
              aria-label="Spreadsheet grid"
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                  e.preventDefault()
                  void copySelection()
                }
              }}
              className="relative min-h-24 overflow-auto rounded-lg border border-line bg-card outline-none focus-visible:border-pine"
              style={{
                // Shrink-wrap small sheets; large ones scroll inside 60vh.
                height: `min(60vh, ${ROW_H + displayIndices.length * ROW_H + 14}px)`,
              }}
            >
              <div style={{ width: contentWidth, height: ROW_H + displayIndices.length * ROW_H }}>
                {/* Header: sticky on top, gutter corner sticky both ways */}
                <div className="sticky top-0 z-20 flex" style={{ width: contentWidth }}>
                  <div
                    className={cx(cellBase, 'sticky left-0 z-30 bg-mint text-center text-pine')}
                    style={{ width: GUTTER_W }}
                  />
                  {Array.from({ length: shownCols }, (_, c) => (
                    <button
                      key={c}
                      onClick={() => onHeaderClick(c)}
                      aria-label={`Sort by column ${colLabel(c)}`}
                      className={cx(
                        cellBase,
                        'inline-flex cursor-pointer items-center justify-center gap-1 text-center font-semibold',
                        sortCol === c ? 'bg-mint text-pine' : 'bg-paper text-muted hover:text-ink',
                      )}
                      style={{ width: COL_W }}
                    >
                      {colLabel(c)}
                      {sortCol === c &&
                        (sortDir === 'asc' ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        ))}
                    </button>
                  ))}
                </div>

                {/* Virtualized row window */}
                <div
                  style={{
                    position: 'absolute',
                    top: ROW_H + range.start * ROW_H,
                    left: 0,
                    width: contentWidth,
                  }}
                >
                  {displayIndices.slice(range.start, range.end).map((srcRow, i) => {
                    const r = range.start + i
                    const row = rows[srcRow] ?? []
                    return (
                      <div key={srcRow} className="flex" style={{ width: contentWidth }}>
                        <div
                          className={cx(
                            cellBase,
                            'sticky left-0 z-10 bg-paper text-right text-faint',
                          )}
                          style={{ width: GUTTER_W }}
                        >
                          {srcRow + 1}
                        </div>
                        {Array.from({ length: shownCols }, (_, c) => {
                          const selected =
                            sel && r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2
                          return (
                            <div
                              key={c}
                              onMouseDown={(e) => onCellClick(r, c, e.shiftKey)}
                              className={cx(
                                cellBase,
                                'cursor-cell select-none',
                                selected ? 'bg-mint text-pine' : 'text-ink',
                              )}
                              style={{ width: COL_W }}
                              title={row[c]}
                            >
                              {row[c] ?? ''}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </ToolLayout>
  )
}
