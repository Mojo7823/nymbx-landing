import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { proxy } from 'comlink'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  LocateFixed,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import type { FileTypeResult } from 'file-type'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { FileDropzone } from '../../components/FileDropzone'
import { ProgressBar } from '../../components/ProgressBar'
import { ToolLayout } from '../../components/ToolLayout'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { createProgressGuard, wrapWorker, type WorkerHandle } from '../../lib/worker'
import { detectFile } from './detect'
import {
  byteToAscii,
  byteToHex,
  bytesToHex,
  BYTES_PER_ROW,
  extensionsMatch,
  filenameExtension,
  formatOffset,
  HEADER_HEIGHT,
  parseByteSearch,
  parseOffsetInput,
  ROW_HEIGHT,
  visibleRows,
  WINDOW_BYTES,
  windowStartForOffset,
} from './hex'
import type { SearchWorkerApi } from './search.worker'

interface Selection {
  anchor: number
  focus: number
}

type DetectionState =
  { status: 'loading' } | { status: 'known'; result: FileTypeResult } | { status: 'unknown' }

const GRID_TEMPLATE = '7.25rem repeat(16, 2.5rem) 12rem'
const OVERSCAN_ROWS = 8

function TypeSummary({ file, detection }: { file: File; detection: DetectionState }) {
  const reported = filenameExtension(file.name)
  const detected = detection.status === 'known' ? detection.result : null
  const mismatch = Boolean(reported && detected && !extensionsMatch(reported, detected.ext))

  return (
    <section className="grid overflow-hidden rounded-lg border border-line bg-card sm:grid-cols-3">
      <div className="min-w-0 border-b border-line p-4 sm:border-r sm:border-b-0">
        <p className="text-[10px] font-semibold tracking-widest text-muted uppercase">File</p>
        <p className="mt-1 truncate text-sm font-semibold text-ink" title={file.name}>
          {file.name}
        </p>
        <p className="mt-1 font-mono text-xs text-muted tabular-nums">{formatBytes(file.size)}</p>
      </div>

      <div className="border-b border-line p-4 sm:border-r sm:border-b-0">
        <p className="text-[10px] font-semibold tracking-widest text-muted uppercase">
          Content signature
        </p>
        {detection.status === 'loading' ? (
          <p className="mt-2 text-xs text-muted">Reading magic bytes…</p>
        ) : detected ? (
          <>
            <p className="mt-1 font-mono text-lg font-semibold text-pine">.{detected.ext}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted">{detected.mime}</p>
          </>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-muted">
            <FileQuestion className="size-4" aria-hidden />
            <span className="text-xs">Unknown signature</span>
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="text-[10px] font-semibold tracking-widest text-muted uppercase">
          Extension check
        </p>
        {mismatch ? (
          <div className="mt-2 flex items-start gap-2 text-rose" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="text-xs leading-relaxed">
              Named <span className="font-mono">.{reported}</span>, but bytes indicate{' '}
              <span className="font-mono">.{detected!.ext}</span>.
            </p>
          </div>
        ) : reported && detected ? (
          <div className="mt-2 flex items-center gap-2 text-pine">
            <CheckCircle2 className="size-4" aria-hidden />
            <span className="text-xs">Filename matches content</span>
          </div>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {!reported ? 'No filename extension to compare.' : 'No known signature to compare.'}
          </p>
        )}
      </div>
    </section>
  )
}

export default function HexViewer() {
  const [file, setFile] = useState<File | null>(null)
  const [detection, setDetection] = useState<DetectionState>({ status: 'unknown' })
  const [bytes, setBytes] = useState(new Uint8Array(0))
  const [windowStart, setWindowStart] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(448)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [jumpValue, setJumpValue] = useState('00000000')
  const [jumpError, setJumpError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchProgress, setSearchProgress] = useState(0)
  const [searchMessage, setSearchMessage] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const pageRunRef = useRef(0)
  const searchRunRef = useRef(0)
  const workerRef = useRef<WorkerHandle<SearchWorkerApi> | null>(null)

  useEffect(
    () => () => {
      workerRef.current?.terminate()
    },
    [],
  )

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [file, loading])

  function searchWorker() {
    workerRef.current ??= wrapWorker<SearchWorkerApi>(
      new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current.api
  }

  async function loadWindow(targetFile: File, targetOffset: number, highlightLength = 0) {
    const run = ++pageRunRef.current
    const boundedOffset = Math.min(Math.max(0, targetOffset), Math.max(0, targetFile.size - 1))
    let start = windowStartForOffset(boundedOffset)
    if (highlightLength > 0 && boundedOffset + highlightLength > start + WINDOW_BYTES) {
      start = Math.floor(boundedOffset / BYTES_PER_ROW) * BYTES_PER_ROW
    }
    setLoading(true)
    setError(null)
    try {
      const loaded = new Uint8Array(
        await targetFile
          .slice(start, Math.min(targetFile.size, start + WINDOW_BYTES))
          .arrayBuffer(),
      )
      if (run !== pageRunRef.current) return
      setBytes(loaded)
      setWindowStart(start)
      setJumpValue(formatOffset(boundedOffset, targetFile.size))
      setSelection(
        highlightLength > 0
          ? {
              anchor: boundedOffset,
              focus: Math.min(targetFile.size - 1, boundedOffset + highlightLength - 1),
            }
          : null,
      )

      requestAnimationFrame(() => {
        const element = scrollRef.current
        if (!element) return
        const row = Math.floor((boundedOffset - start) / BYTES_PER_ROW)
        const top = HEADER_HEIGHT + row * ROW_HEIGHT
        element.scrollTop = Math.max(0, top - element.clientHeight / 2)
      })
    } catch {
      if (run === pageRunRef.current) setError('Could not read bytes from this file.')
    } finally {
      if (run === pageRunRef.current) setLoading(false)
    }
  }

  async function openFile(files: File[]) {
    const picked = files[0]
    if (!picked) return
    cancelSearch(false)
    setFile(picked)
    setBytes(new Uint8Array(0))
    setSelection(null)
    setError(null)
    setJumpError(null)
    setSearchMessage(null)
    setSearchError(null)
    setDetection({ status: 'loading' })

    void detectFile(picked).then((result) =>
      setDetection(result ? { status: 'known', result } : { status: 'unknown' }),
    )
    await loadWindow(picked, 0)
  }

  function reset() {
    cancelSearch(false)
    pageRunRef.current += 1
    setFile(null)
    setBytes(new Uint8Array(0))
    setSelection(null)
    setError(null)
    setDetection({ status: 'unknown' })
  }

  function cancelSearch(showMessage = true) {
    searchRunRef.current += 1
    workerRef.current?.terminate()
    workerRef.current = null
    setSearching(false)
    setSearchProgress(0)
    if (showMessage) setSearchMessage('Search cancelled.')
  }

  async function findNext() {
    if (!file || searching) return
    setSearchError(null)
    setSearchMessage(null)
    let needle: Uint8Array
    try {
      needle = parseByteSearch(query)
    } catch (cause) {
      setSearchError(cause instanceof Error ? cause.message : 'Invalid byte sequence.')
      return
    }

    const run = ++searchRunRef.current
    const selectionEnd = selection ? Math.max(selection.anchor, selection.focus) : -1
    const startOffset = selectionEnd >= 0 ? Math.min(file.size, selectionEnd + 1) : windowStart
    setSearching(true)
    setSearchProgress(0)

    // Guarded as well as run-checked: a late Comlink tick from this run
    // must not resurrect progress the finally below just cleared.
    const guard = createProgressGuard((scanned: number, total: number) => {
      if (run === searchRunRef.current && total > 0) {
        setSearchProgress((scanned / total) * 100)
      }
    })
    try {
      const result = await searchWorker().find(file, needle, startOffset, proxy(guard.onProgress))
      if (run !== searchRunRef.current) return
      if (!result) {
        setSearchMessage('No matching byte sequence was found.')
        return
      }
      await loadWindow(file, result.offset, needle.length)
      setSearchMessage(
        `Match at 0x${formatOffset(result.offset, file.size)}${result.wrapped ? ' · wrapped to the beginning' : ''}`,
      )
    } catch {
      if (run === searchRunRef.current) setSearchError('Byte search could not be completed.')
    } finally {
      guard.settle()
      if (run === searchRunRef.current) {
        setSearching(false)
        setSearchProgress(0)
      }
    }
  }

  function jump(event: FormEvent) {
    event.preventDefault()
    if (!file) return
    setJumpError(null)
    try {
      void loadWindow(file, parseOffsetInput(jumpValue, file.size))
    } catch (cause) {
      setJumpError(cause instanceof Error ? cause.message : 'Invalid offset.')
    }
  }

  function selectByte(offset: number, extend: boolean) {
    setSelection((current) =>
      extend && current
        ? { anchor: current.anchor, focus: offset }
        : { anchor: offset, focus: offset },
    )
  }

  const rowCount = Math.ceil(bytes.length / BYTES_PER_ROW)
  const range = visibleRows(scrollTop, viewportHeight, rowCount, OVERSCAN_ROWS)
  const rows = Array.from({ length: range.end - range.start }, (_, index) => range.start + index)
  const selectedStart = selection ? Math.min(selection.anchor, selection.focus) : -1
  const selectedEnd = selection ? Math.max(selection.anchor, selection.focus) : -1
  const selectionHex = useMemo(() => {
    if (!selection || selectedStart < windowStart || selectedEnd >= windowStart + bytes.length) {
      return ''
    }
    return bytesToHex(bytes.slice(selectedStart - windowStart, selectedEnd - windowStart + 1))
  }, [bytes, selectedEnd, selectedStart, selection, windowStart])
  const windowEnd = bytes.length > 0 ? windowStart + bytes.length - 1 : windowStart

  return (
    <ToolLayout
      title="Hex viewer"
      description="Inspect raw bytes without loading the whole file. Identify content by its magic signature, compare it with the filename, navigate by offset, and search byte sequences locally."
      badge="client-side"
    >
      {!file ? (
        <FileDropzone
          onFiles={(files) => void openFile(files)}
          hint="Any file size or format. Only small byte windows are read into memory"
        />
      ) : (
        <div className="space-y-4">
          <TypeSummary file={file} detection={detection} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-pine">
              <ShieldCheck className="size-4" aria-hidden />
              <span>Read-only · file stays on this device</span>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
              <Trash2 className="size-3.5" aria-hidden /> Choose another
            </Button>
          </div>

          <section className="rounded-lg border border-line bg-card p-3 sm:p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(20rem,1.2fr)]">
              <form onSubmit={jump}>
                <label htmlFor="hex-offset" className="text-xs font-semibold text-muted">
                  Go to offset <span className="font-mono font-normal text-faint">(hex)</span>
                </label>
                <div className="mt-1.5 flex gap-2">
                  <div className="flex min-w-0 flex-1 items-center rounded-md border border-line-strong bg-page focus-within:border-pine">
                    <span className="pl-2.5 font-mono text-xs text-faint">0x</span>
                    <input
                      id="hex-offset"
                      value={jumpValue.replace(/^0x/i, '')}
                      onChange={(event) => setJumpValue(event.target.value)}
                      className="h-9 min-w-0 flex-1 bg-transparent px-1.5 font-mono text-xs text-ink outline-none"
                      spellCheck={false}
                    />
                  </div>
                  <Button type="submit" size="sm">
                    <LocateFixed className="size-3.5" aria-hidden /> Go
                  </Button>
                </div>
                {jumpError && (
                  <p role="alert" className="mt-1.5 text-xs text-rose">
                    {jumpError}
                  </p>
                )}
              </form>

              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void findNext()
                }}
              >
                <label htmlFor="byte-search" className="text-xs font-semibold text-muted">
                  Find bytes <span className="font-mono font-normal text-faint">(hex)</span>
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="byte-search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value)
                      setSearchError(null)
                      setSearchMessage(null)
                    }}
                    placeholder="89 50 4E 47"
                    className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-page px-2.5 font-mono text-xs text-ink placeholder:text-faint focus:border-pine focus:outline-none"
                    spellCheck={false}
                  />
                  {searching ? (
                    <Button variant="secondary" size="sm" onClick={() => cancelSearch()}>
                      <X className="size-3.5" aria-hidden /> Cancel
                    </Button>
                  ) : (
                    <Button type="submit" size="sm" disabled={!query.trim()}>
                      <Search className="size-3.5" aria-hidden /> Find next
                    </Button>
                  )}
                </div>
                {searching && (
                  <ProgressBar
                    className="mt-2"
                    value={searchProgress}
                    label="Searching with 1 MB file slices"
                  />
                )}
                {searchError && (
                  <p role="alert" className="mt-1.5 text-xs text-rose">
                    {searchError}
                  </p>
                )}
                {searchMessage && (
                  <p role="status" className="mt-1.5 font-mono text-xs text-muted">
                    {searchMessage}
                  </p>
                )}
              </form>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-line bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-soft px-3 py-2.5">
              <div className="w-full min-w-0 sm:flex-1">
                <p className="font-mono text-xs font-semibold text-ink tabular-nums">
                  0x{formatOffset(windowStart, file.size)}–0x{formatOffset(windowEnd, file.size)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {formatBytes(bytes.length)} window · click a byte, Shift+click to extend
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={loading || windowStart === 0}
                onClick={() => void loadWindow(file, Math.max(0, windowStart - WINDOW_BYTES))}
                aria-label="Previous byte window"
              >
                <ChevronLeft className="size-3.5" aria-hidden /> Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={loading || windowStart + bytes.length >= file.size}
                onClick={() => void loadWindow(file, windowStart + WINDOW_BYTES)}
                aria-label="Next byte window"
              >
                Next <ChevronRight className="size-3.5" aria-hidden />
              </Button>
              <CopyButton
                text={selectionHex}
                label={
                  selectionHex
                    ? `Copy ${selectedEnd - selectedStart + 1} byte${selectedEnd === selectedStart ? '' : 's'}`
                    : 'Copy selection'
                }
                disabled={!selectionHex}
              />
            </div>

            {error ? (
              <p role="alert" className="p-4 text-sm text-rose">
                {error}
              </p>
            ) : file.size === 0 ? (
              <div className="flex min-h-56 flex-col items-center justify-center gap-2 p-6 text-center">
                <FileQuestion className="size-7 text-faint" aria-hidden />
                <p className="text-sm font-medium text-ink">This file is empty</p>
                <p className="text-xs text-muted">There are no bytes to display or search.</p>
              </div>
            ) : loading && bytes.length === 0 ? (
              <ProgressBar className="m-6" label="Reading byte window" />
            ) : (
              <div
                ref={scrollRef}
                className="max-h-[min(28rem,62vh)] overflow-auto bg-page"
                onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
              >
                <div
                  className="min-w-[59.25rem] font-mono text-xs"
                  role="grid"
                  aria-label="Hex dump"
                >
                  <div
                    className="sticky top-0 z-10 grid h-8 items-center border-b border-line bg-soft text-[10px] font-semibold tracking-wide text-muted"
                    style={{ gridTemplateColumns: GRID_TEMPLATE }}
                    role="row"
                  >
                    <span className="px-3" role="columnheader">
                      OFFSET
                    </span>
                    {Array.from({ length: BYTES_PER_ROW }, (_, index) => (
                      <span
                        key={index}
                        className={cx('text-center', index === 7 && 'border-r border-line-strong')}
                        role="columnheader"
                      >
                        {byteToHex(index)}
                      </span>
                    ))}
                    <span className="border-l border-line-strong px-3" role="columnheader">
                      ASCII
                    </span>
                  </div>

                  <div className="relative" style={{ height: rowCount * ROW_HEIGHT }}>
                    {rows.map((row) => {
                      const rowStart = row * BYTES_PER_ROW
                      const rowBytes = bytes.slice(rowStart, rowStart + BYTES_PER_ROW)
                      const absoluteRowStart = windowStart + rowStart
                      return (
                        <div
                          key={absoluteRowStart}
                          className="absolute left-0 grid h-7 items-center border-b border-line/70"
                          style={{
                            top: row * ROW_HEIGHT,
                            gridTemplateColumns: GRID_TEMPLATE,
                          }}
                          role="row"
                        >
                          <span
                            className="px-3 text-[11px] text-faint tabular-nums"
                            role="rowheader"
                          >
                            {formatOffset(absoluteRowStart, file.size)}
                          </span>
                          {Array.from({ length: BYTES_PER_ROW }, (_, column) => {
                            const byte = rowBytes[column]
                            if (byte === undefined) return <span key={column} />
                            const absoluteOffset = absoluteRowStart + column
                            const selected =
                              absoluteOffset >= selectedStart && absoluteOffset <= selectedEnd
                            return (
                              <button
                                key={column}
                                type="button"
                                role="gridcell"
                                aria-selected={selected}
                                title={`0x${formatOffset(absoluteOffset, file.size)} · ${byte}`}
                                onClick={(event) => selectByte(absoluteOffset, event.shiftKey)}
                                className={cx(
                                  'h-7 cursor-pointer text-center text-ink transition-colors hover:bg-mint hover:text-pine focus:z-10',
                                  column === 7 && 'border-r border-line-strong',
                                  selected && 'bg-pine text-page hover:bg-pine hover:text-page',
                                )}
                              >
                                {byteToHex(byte)}
                              </button>
                            )
                          })}
                          <span
                            className="grid h-7 grid-cols-16 items-center border-l border-line-strong px-2"
                            aria-hidden="true"
                          >
                            {Array.from(rowBytes, (byte, column) => {
                              const absoluteOffset = absoluteRowStart + column
                              const selected =
                                absoluteOffset >= selectedStart && absoluteOffset <= selectedEnd
                              return (
                                <span
                                  key={column}
                                  className={cx(
                                    'text-center text-[11px] text-muted',
                                    selected && 'bg-pine text-page',
                                  )}
                                >
                                  {byteToAscii(byte)}
                                </span>
                              )
                            })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </ToolLayout>
  )
}
