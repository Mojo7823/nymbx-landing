import { useEffect, useMemo, useRef, useState } from 'react'
import { proxy } from 'comlink'
import {
  Download,
  File as FileIcon,
  FilePlus,
  Folder,
  FolderArchive,
  FolderPlus,
  Lock,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { createProgressGuard, wrapWorker, type WorkerHandle } from '../../lib/worker'
import { inputFilePath, type DroppedPath } from '../../lib/dropFiles'
import { planCreateEntries, withDirectoryEntries, type ZipEntryInfo } from './zipEntries'
import type { ExtractError } from './zipTool'
import type { ZipToolWorkerApi } from './zipTool.worker'

type Mode = 'create' | 'extract'

const MODE_LABELS: Record<Mode, string> = {
  create: 'Create zip',
  extract: 'Extract zip',
}

const LEVEL_OPTIONS = [
  { value: 0, label: 'Store — fastest, no compression' },
  { value: 1, label: 'Fast' },
  { value: 6, label: 'Balanced (default)' },
  { value: 9, label: 'Best — slowest, smallest' },
]

function setDirectoryAttributes(el: HTMLInputElement | null) {
  // React has no webkitdirectory prop — set the attributes directly.
  el?.setAttribute('webkitdirectory', '')
  el?.setAttribute('directory', '')
}

function baseName(path: string): string {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  return trimmed.split('/').pop() || 'file'
}

function depthOf(path: string): number {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path
  return Math.max(0, trimmed.split('/').length - 1)
}

function blobFor(data: Uint8Array): Blob {
  // slice().buffer yields a clean ArrayBuffer (offset-safe and BlobPart-typed).
  return new Blob([data.slice().buffer], { type: 'application/octet-stream' })
}

type GetWorker = () => WorkerHandle<ZipToolWorkerApi>

let nextId = 1

interface CreateItem {
  id: number
  file: File
  path: string
}

function CreatePanel({ getWorker }: { getWorker: GetWorker }) {
  const [items, setItems] = useState<CreateItem[]>([])
  const [level, setLevel] = useState(6)
  const [progressBytes, setProgressBytes] = useState<number | null>(null)
  const [session, setSession] = useState(0)
  const addFilesRef = useRef<HTMLInputElement>(null)
  const addDirRef = useRef<HTMLInputElement>(null)

  const plan = useMemo(
    () => planCreateEntries(items.map((item) => ({ name: item.file.name, path: item.path }))),
    [items],
  )
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0)
  const impliedDirs = useMemo(() => {
    const okNames = plan.rows.filter((row) => row.status === 'ok').map((row) => row.entryName)
    return withDirectoryEntries(okNames).length - okNames.length
  }, [plan])

  const busy = progressBytes !== null
  const canDownload = items.length > 0 && !plan.hasBlocking && !busy

  function addPaths(paths: DroppedPath[]) {
    setItems((prev) => [...prev, ...paths.map(({ file, path }) => ({ id: nextId++, file, path }))])
  }

  function reset() {
    setItems([])
    setProgressBytes(null)
    setSession((s) => s + 1)
  }

  async function downloadZip() {
    if (!canDownload) return
    const guard = createProgressGuard((bytesDone: number) => setProgressBytes(bytesDone))
    setProgressBytes(0)
    try {
      const pairs = items
        .map((item, index) => ({ item, row: plan.rows[index]! }))
        .filter(({ row }) => row.status === 'ok')
      const fileInputs = pairs.map(({ item, row }) => ({ name: row.entryName, blob: item.file }))
      const known = new Set(fileInputs.map((entry) => entry.name))
      const dirInputs = withDirectoryEntries(fileInputs.map((entry) => entry.name))
        .filter((name) => !known.has(name))
        .map((name) => ({ name, blob: new Blob([]) }))
      const blob = await getWorker().api.buildZip(
        [...fileInputs, ...dirInputs],
        level,
        proxy(guard.onProgress),
      )
      downloadBlob(blob, 'archive.zip')
    } finally {
      guard.settle()
      setProgressBytes(null)
    }
  }

  return (
    <div>
      {items.length === 0 ? (
        <FileDropzone
          key={session}
          multiple
          folders
          onFiles={() => {}}
          onPaths={addPaths}
          hint="Files or whole folders — structure is preserved inside the zip"
        />
      ) : (
        <>
          <p className="mb-3 font-mono text-[11px] text-muted tabular-nums" role="status">
            {items.length} {items.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}
            {impliedDirs > 0 &&
              ` · ${impliedDirs} ${impliedDirs === 1 ? 'folder' : 'folders'} recreated`}
          </p>

          <ul className="divide-y divide-line rounded-lg border border-line bg-card">
            {items.map((item, index) => {
              const row = plan.rows[index]!
              const blocked = row.status !== 'ok'
              return (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className={cx(
                        'truncate font-mono text-xs',
                        blocked ? 'text-red-600 dark:text-red-400' : 'text-ink',
                      )}
                      title={row.entryName || item.path}
                    >
                      {row.entryName || item.path}
                    </p>
                    {blocked ? (
                      <p role="alert" className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">
                        {row.reason}
                      </p>
                    ) : (
                      <p className="mt-0.5 truncate font-mono text-[11px] text-faint">
                        from {item.file.name}
                      </p>
                    )}
                  </div>
                  <span className="hidden shrink-0 font-mono text-[11px] text-muted tabular-nums md:block">
                    {formatBytes(item.file.size)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setItems((prev) => prev.filter((f) => f.id !== item.id))}
                    aria-label={`Remove ${item.path}`}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => addFilesRef.current?.click()}>
              <FilePlus className="size-3.5" />
              Add files
            </Button>
            <Button variant="secondary" size="sm" onClick={() => addDirRef.current?.click()}>
              <FolderPlus className="size-3.5" />
              Add folder
            </Button>
            <input
              ref={addFilesRef}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files) {
                  addPaths(Array.from(e.target.files).map((file) => ({ file, path: file.name })))
                }
                e.target.value = ''
              }}
            />
            <input
              ref={setDirectoryAttributes}
              type="file"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files) {
                  addPaths(
                    Array.from(e.target.files).map((file) => ({ file, path: inputFilePath(file) })),
                  )
                }
                e.target.value = ''
              }}
            />
            <Button variant="ghost" size="sm" onClick={reset}>
              <Trash2 className="size-3.5" />
              Clear all
            </Button>
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-lg border border-line bg-card p-4">
            <label className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-xs font-semibold text-muted">Compression</span>
              <select
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
              >
                {LEVEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {plan.hasBlocking && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                Resolve the highlighted name conflicts before downloading — two entries must not end
                up with the same path.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void downloadZip()} disabled={!canDownload}>
                <FolderArchive className="size-4" />
                {busy ? 'Zipping…' : 'Download .zip'}
              </Button>
              {busy && (
                <ProgressBar
                  className="min-w-40 flex-1"
                  value={totalBytes === 0 ? 100 : (progressBytes / totalBytes) * 100}
                  label="Compressing"
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

type ExtractPhase = 'idle' | 'listing' | 'ready' | 'working' | 'error'

function ExtractPanel({ getWorker }: { getWorker: GetWorker }) {
  const [archive, setArchive] = useState<File | null>(null)
  const [entries, setEntries] = useState<ZipEntryInfo[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [phase, setPhase] = useState<ExtractPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null)
  const [extractErrors, setExtractErrors] = useState<ExtractError[]>([])
  const [session, setSession] = useState(0)
  const requestRef = useRef(0)

  const sorted = useMemo(
    () =>
      entries
        ? [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        : null,
    [entries],
  )
  const files = useMemo(() => sorted?.filter((entry) => !entry.isDirectory) ?? [], [sorted])
  const encrypted = useMemo(() => files.filter((entry) => entry.encrypted), [files])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const downloadable = useMemo(
    () => files.filter((entry) => selectedSet.has(entry.name) && !entry.encrypted),
    [files, selectedSet],
  )
  const blockedCount = selected.length - downloadable.length
  const unpackedTotal = files.reduce((sum, entry) => sum + entry.size, 0)
  const selectedBytes = downloadable.reduce((sum, entry) => sum + entry.size, 0)
  const busy = phase === 'listing' || phase === 'working'

  async function openArchive(file: File | undefined) {
    if (!file) return
    const request = requestRef.current + 1
    requestRef.current = request
    setArchive(file)
    setEntries(null)
    setSelected([])
    setExtractErrors([])
    setError(null)
    setPhase('listing')
    try {
      const listed = await getWorker().api.listZip(file)
      if (requestRef.current !== request) return
      setEntries(listed)
      setSelected(listed.filter((entry) => !entry.isDirectory).map((entry) => entry.name))
      setPhase('ready')
    } catch (cause) {
      if (requestRef.current !== request) return
      setPhase('error')
      setError(cause instanceof Error ? cause.message : 'Could not read this zip archive.')
    }
  }

  function reset() {
    requestRef.current += 1
    setArchive(null)
    setEntries(null)
    setSelected([])
    setExtractErrors([])
    setError(null)
    setProgress(null)
    setPhase('idle')
    setSession((s) => s + 1)
  }

  function toggle(name: string) {
    setSelected((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))
  }

  async function runExtract(names: string[]): Promise<boolean> {
    if (!archive || names.length === 0) return false
    const extractGuard = createProgressGuard((bytesDone: number) =>
      setProgress({ label: 'Extracting', value: bytesDone }),
    )
    setPhase('working')
    setExtractErrors([])
    setProgress({ label: 'Extracting', value: 0 })
    try {
      const result = await getWorker().api.extractZip(
        archive,
        names,
        proxy(extractGuard.onProgress),
      )
      setExtractErrors(result.errors)
      if (result.files.length === 0) {
        setError(
          result.errors.length > 0
            ? 'Nothing could be extracted — see the errors below.'
            : 'Nothing was extracted.',
        )
        return false
      }
      if (names.length > 1) {
        setProgress({ label: 'Re-zipping', value: 0 })
        const total = result.files.reduce((sum, file) => sum + file.data.length, 0)
        const rezipGuard = createProgressGuard((bytesDone: number) =>
          setProgress({
            label: 'Re-zipping',
            value: total === 0 ? 100 : (bytesDone / total) * 100,
          }),
        )
        try {
          const rezipped = await getWorker().api.buildZip(
            result.files.map((file) => ({ name: file.name, blob: blobFor(file.data) })),
            6,
            proxy(rezipGuard.onProgress),
          )
          downloadBlob(rezipped, 'extracted-files.zip')
        } finally {
          rezipGuard.settle()
        }
      } else {
        const file = result.files[0]!
        downloadBlob(blobFor(file.data), baseName(file.name))
      }
      return true
    } finally {
      extractGuard.settle()
      setPhase('ready')
      setProgress(null)
    }
  }

  return (
    <div>
      {phase === 'idle' || phase === 'error' ? (
        <>
          <FileDropzone
            key={session}
            accept=".zip,application/zip,application/x-zip-compressed"
            onFiles={(dropped) => void openArchive(dropped[0])}
            hint="One .zip archive at a time"
          />
          {phase === 'error' && (
            <div className="mt-4 flex flex-col items-start gap-3">
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error ?? 'Could not read this zip archive.'}
              </p>
              <Button variant="secondary" size="sm" onClick={reset}>
                <RotateCcw className="size-3.5" />
                Try another file
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-4">
          {phase === 'listing' && <ProgressBar label="Reading archive…" className="max-w-md" />}

          {archive && (
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{archive.name}</p>
                <p className="font-mono text-[11px] text-muted tabular-nums" role="status">
                  {files.length} {files.length === 1 ? 'file' : 'files'} ·{' '}
                  {formatBytes(unpackedTotal)} unpacked · {formatBytes(archive.size)} archive
                </p>
                <Button variant="ghost" size="sm" className="mt-1" onClick={reset} disabled={busy}>
                  <RotateCcw className="size-3.5" />
                  Choose another
                </Button>
              </div>
            </div>
          )}

          {encrypted.length > 0 && (
            <div
              className="flex items-start gap-2.5 rounded-lg border border-amber-badge/40 bg-amber-soft p-4"
              role="alert"
            >
              <Lock className="mt-0.5 size-4 shrink-0 text-amber-badge" />
              <div className="text-xs text-amber-badge">
                <p className="font-semibold">
                  {encrypted.length} {encrypted.length === 1 ? 'entry is' : 'entries are'}{' '}
                  password-protected.
                </p>
                <p className="mt-0.5">
                  Passwords aren&apos;t supported — those entries are listed but will be skipped:{' '}
                  <span className="font-mono break-all">
                    {encrypted
                      .slice(0, 5)
                      .map((entry) => entry.name)
                      .join(', ')}
                    {encrypted.length > 5 && `, and ${encrypted.length - 5} more`}
                  </span>
                </p>
              </div>
            </div>
          )}

          {sorted && files.length === 0 && (
            <p role="status" className="text-sm text-faint">
              This archive holds no files — nothing to extract.
            </p>
          )}

          {sorted && files.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(files.map((entry) => entry.name))}
                  disabled={busy}
                >
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected([])} disabled={busy}>
                  Select none
                </Button>
                <span
                  className="ml-auto font-mono text-[11px] text-muted tabular-nums"
                  role="status"
                >
                  {downloadable.length} selected · {formatBytes(selectedBytes)}
                  {blockedCount > 0 && ` · ${blockedCount} skipped (protected)`}
                </span>
              </div>

              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                {sorted.map((entry) => {
                  if (entry.isDirectory) {
                    return (
                      <li
                        key={entry.name}
                        className="flex items-center gap-2.5 px-3 py-1.5"
                        style={{ paddingLeft: `${0.75 + depthOf(entry.name) * 1.25}rem` }}
                      >
                        <Folder className="size-3.5 shrink-0 text-faint" />
                        <span className="truncate font-mono text-xs text-muted" title={entry.name}>
                          {baseName(entry.name)}/
                        </span>
                      </li>
                    )
                  }
                  const checked = selectedSet.has(entry.name)
                  return (
                    <li
                      key={entry.name}
                      className="flex items-center gap-2.5 px-3 py-1.5"
                      style={{ paddingLeft: `${0.75 + depthOf(entry.name) * 1.25}rem` }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(entry.name)}
                        aria-label={`Select ${entry.name}`}
                        disabled={busy}
                        className="size-3.5 shrink-0 cursor-pointer accent-(--color-pine)"
                      />
                      <FileIcon className="size-3.5 shrink-0 text-faint" />
                      <span
                        className="min-w-0 flex-1 truncate font-mono text-xs text-ink"
                        title={entry.name}
                      >
                        {baseName(entry.name)}
                      </span>
                      {entry.encrypted && (
                        <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-amber-badge uppercase">
                          <Lock className="size-3" />
                          encrypted
                        </span>
                      )}
                      <span className="shrink-0 font-mono text-[11px] text-muted tabular-nums">
                        {formatBytes(entry.size)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void runExtract([entry.name])}
                        disabled={busy || entry.encrypted}
                        aria-label={`Download ${entry.name}`}
                      >
                        <Download className="size-3.5" />
                      </Button>
                    </li>
                  )
                })}
              </ul>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => void runExtract(downloadable.map((entry) => entry.name))}
                  disabled={busy || downloadable.length === 0}
                >
                  <Download className="size-4" />
                  {busy
                    ? 'Working…'
                    : downloadable.length <= 1
                      ? 'Download selected file'
                      : `Download ${downloadable.length} files (.zip)`}
                </Button>
                {progress && (
                  <ProgressBar
                    className="min-w-40 flex-1"
                    value={
                      progress.label === 'Extracting' && archive
                        ? (progress.value / archive.size) * 100
                        : progress.value
                    }
                    label={progress.label}
                  />
                )}
              </div>
              {downloadable.length === 0 && (
                <p className="text-xs text-faint">
                  {encrypted.length > 0 && selected.length > 0
                    ? 'The selected entries are all password-protected — deselect or pick other files.'
                    : 'Select at least one file to extract.'}
                </p>
              )}
              {extractErrors.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-line bg-card p-3" role="alert">
                  {extractErrors.map((failure) => (
                    <li key={failure.name} className="font-mono text-[11px] text-amber-badge">
                      {failure.name}: {failure.message}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function ZipUnzip() {
  const [mode, setMode] = useState<Mode>('create')
  const workerRef = useRef<WorkerHandle<ZipToolWorkerApi> | null>(null)

  useEffect(
    () => () => {
      workerRef.current?.terminate()
    },
    [],
  )

  function getWorker(): WorkerHandle<ZipToolWorkerApi> {
    workerRef.current ??= wrapWorker<ZipToolWorkerApi>(
      // Separate chunk in the production build, so the dashboard bundle
      // stays light until this route opens.
      new Worker(new URL('./zipTool.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current
  }

  return (
    <ToolLayout
      title="Zip / unzip"
      description="Pack files and folders into a compressed archive, or pull the files back out — selectively. Everything runs in your browser."
      badge="client-side"
    >
      <div role="radiogroup" aria-label="Tool mode" className="mb-6 flex flex-wrap gap-1">
        {(Object.keys(MODE_LABELS) as Mode[]).map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={mode === id}
            onClick={() => setMode(id)}
            className={cx(
              'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              mode === id ? 'bg-mint text-pine' : 'text-muted hover:bg-soft hover:text-ink',
            )}
          >
            {MODE_LABELS[id]}
          </button>
        ))}
      </div>

      {mode === 'create' ? (
        <CreatePanel getWorker={getWorker} />
      ) : (
        <ExtractPanel getWorker={getWorker} />
      )}
    </ToolLayout>
  )
}
