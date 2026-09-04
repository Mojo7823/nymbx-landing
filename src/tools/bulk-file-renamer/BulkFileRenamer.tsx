import { useMemo, useRef, useState } from 'react'
import { proxy } from 'comlink'
import { ArrowRight, FilePlus, FolderArchive, Trash2, X } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { createProgressGuard, wrapWorker, type WorkerHandle } from '../../lib/worker'
import {
  buildRenamePlan,
  defaultOptions,
  type CaseTransform,
  type RenameOptions,
  type RowStatus,
} from './renameLogic'
import type { ZipWorkerApi } from './zip.worker'

interface FileItem {
  id: number
  file: File
}

let nextId = 1

const statusStyles: Record<RowStatus, { label: string; className: string }> = {
  renamed: { label: 'renamed', className: 'text-pine' },
  unchanged: { label: 'unchanged', className: 'text-muted' },
  conflict: { label: 'name conflict', className: 'text-red-600 dark:text-red-400' },
  invalid: { label: 'invalid name', className: 'text-red-600 dark:text-red-400' },
}

export default function BulkFileRenamer() {
  const [items, setItems] = useState<FileItem[]>([])
  const [options, setOptions] = useState<RenameOptions>(defaultOptions)
  const [zipProgress, setZipProgress] = useState<number | null>(null)

  const workerRef = useRef<WorkerHandle<ZipWorkerApi> | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)

  const plan = useMemo(
    () =>
      buildRenamePlan(
        items.map((i) => i.file.name),
        options,
      ),
    [items, options],
  )

  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { renamed: 0, unchanged: 0, conflict: 0, invalid: 0 }
    for (const row of plan.rows) c[row.status]++
    return c
  }, [plan])

  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0)
  const zipping = zipProgress !== null
  const canDownload = items.length > 0 && !plan.hasBlocking && !zipping

  function set<K extends keyof RenameOptions>(key: K, value: RenameOptions[K]) {
    setOptions((prev) => ({ ...prev, [key]: value }))
  }

  function setNumbering(patch: Partial<RenameOptions['numbering']>) {
    setOptions((prev) => ({ ...prev, numbering: { ...prev.numbering, ...patch } }))
  }

  function addFiles(files: File[]) {
    setItems((prev) => [...prev, ...files.map((file) => ({ id: nextId++, file }))])
  }

  async function downloadRenamedZip() {
    if (!canDownload) return
    setZipProgress(0)
    // Guarded: a Comlink progress tick can arrive after the build resolved
    // and would otherwise resurrect the bar after cleanup (see worker.ts).
    const guard = createProgressGuard((bytesDone: number) => setZipProgress(bytesDone))
    try {
      workerRef.current ??= wrapWorker<ZipWorkerApi>(
        new Worker(new URL('./zip.worker.ts', import.meta.url), { type: 'module' }),
      )
      const entries = items.map((item, i) => ({ name: plan.rows[i].newName, blob: item.file }))
      const blob = await workerRef.current.api.buildZip(entries, proxy(guard.onProgress))
      downloadBlob(blob, 'renamed-files.zip')
    } finally {
      guard.settle()
      setZipProgress(null)
    }
  }

  return (
    <ToolLayout
      title="Bulk file renamer"
      description="Rename many files at once with find & replace, prefixes, numbering and case transforms, then download them as a zip. Your original files are never modified."
      badge="client-side"
    >
      {/* Rename options */}
      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-line bg-card p-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex min-w-0 grow basis-48 flex-col gap-1">
            <span className="text-xs font-medium text-muted">Find</span>
            <input
              type="text"
              value={options.find}
              onChange={(e) => set('find', e.target.value)}
              placeholder={options.useRegex ? String.raw`e.g. IMG_(\d+)` : 'Text to find…'}
              spellCheck={false}
              className="h-8 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
            />
          </label>
          <label className="flex min-w-0 grow basis-48 flex-col gap-1">
            <span className="text-xs font-medium text-muted">Replace with</span>
            <input
              type="text"
              value={options.replace}
              onChange={(e) => set('replace', e.target.value)}
              placeholder={options.useRegex ? 'e.g. photo-$1' : 'Replacement…'}
              spellCheck={false}
              className="h-8 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
            />
          </label>
          <label className="flex h-8 cursor-pointer items-center gap-1.5 text-xs font-medium text-ink">
            <input
              type="checkbox"
              checked={options.useRegex}
              onChange={(e) => set('useRegex', e.target.checked)}
              className="size-3.5 accent-(--color-pine)"
            />
            Regex
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex min-w-0 grow basis-40 flex-col gap-1">
            <span className="text-xs font-medium text-muted">Prefix</span>
            <input
              type="text"
              value={options.prefix}
              onChange={(e) => set('prefix', e.target.value)}
              placeholder="Added before the name…"
              spellCheck={false}
              className="h-8 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
            />
          </label>
          <label className="flex min-w-0 grow basis-40 flex-col gap-1">
            <span className="text-xs font-medium text-muted">Suffix</span>
            <input
              type="text"
              value={options.suffix}
              onChange={(e) => set('suffix', e.target.value)}
              placeholder="Added after the name…"
              spellCheck={false}
              className="h-8 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Case</span>
            <select
              value={options.caseTransform}
              onChange={(e) => set('caseTransform', e.target.value as CaseTransform)}
              className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
            >
              <option value="none">Keep case</option>
              <option value="lower">lowercase</option>
              <option value="upper">UPPERCASE</option>
              <option value="title">Title Case</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-line pt-3">
          <label className="flex h-8 cursor-pointer items-center gap-1.5 text-xs font-medium text-ink">
            <input
              type="checkbox"
              checked={options.numbering.enabled}
              onChange={(e) => setNumbering({ enabled: e.target.checked })}
              className="size-3.5 accent-(--color-pine)"
            />
            Sequential numbering
          </label>
          {options.numbering.enabled && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Position</span>
                <select
                  value={options.numbering.position}
                  onChange={(e) =>
                    setNumbering({ position: e.target.value as 'prefix' | 'suffix' })
                  }
                  className="h-8 rounded-md border border-line-strong bg-card px-2 text-xs text-ink focus:border-pine focus:outline-none"
                >
                  <option value="prefix">Before name (001-…)</option>
                  <option value="suffix">After name (…-001)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Start at</span>
                <input
                  type="number"
                  min={0}
                  value={options.numbering.start}
                  onChange={(e) =>
                    setNumbering({ start: Math.max(0, Math.floor(Number(e.target.value) || 0)) })
                  }
                  className="h-8 w-20 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Padding</span>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={options.numbering.pad}
                  onChange={(e) =>
                    setNumbering({
                      pad: Math.min(6, Math.max(1, Math.floor(Number(e.target.value) || 1))),
                    })
                  }
                  className="h-8 w-16 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
                />
              </label>
            </>
          )}
        </div>

        {plan.error && (
          <p role="alert" className="font-mono text-xs text-red-600 dark:text-red-400">
            {plan.error}
          </p>
        )}
      </div>

      {/* Input / preview */}
      {items.length === 0 ? (
        <FileDropzone
          multiple
          onFiles={addFiles}
          hint="Files are renamed in memory only; nothing on your disk changes"
        />
      ) : (
        <>
          <p className="mb-3 font-mono text-[11px] text-muted tabular-nums" role="status">
            {items.length} {items.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}
            {' · '}
            <span className="text-pine">{counts.renamed} renamed</span>
            {' · '}
            {counts.unchanged} unchanged
            {(counts.conflict > 0 || counts.invalid > 0) && (
              <>
                {' · '}
                <span className="text-red-600 dark:text-red-400">
                  {counts.conflict + counts.invalid} blocked
                </span>
              </>
            )}
          </p>

          <ul className="divide-y divide-line rounded-lg border border-line bg-card">
            {items.map((item, i) => {
              const row = plan.rows[i]
              const style = statusStyles[row.status]
              const blocked = row.status === 'conflict' || row.status === 'invalid'
              return (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="grid min-w-0 flex-1 items-center gap-x-2 gap-y-0.5 sm:grid-cols-[1fr_auto_1fr]">
                    <span className="min-w-0 truncate font-mono text-xs text-muted">
                      {row.oldName}
                    </span>
                    <ArrowRight className="hidden size-3.5 shrink-0 text-muted sm:block" />
                    <span
                      className={cx(
                        'min-w-0 font-mono text-xs break-all',
                        blocked ? 'text-red-600 dark:text-red-400' : 'text-ink',
                        row.status === 'unchanged' && 'text-muted',
                      )}
                    >
                      {row.newName}
                      <span className={cx('ml-2 text-[10px] uppercase', style.className)}>
                        {style.label}
                      </span>
                    </span>
                  </div>
                  <span className="hidden shrink-0 font-mono text-[11px] text-muted tabular-nums md:block">
                    {formatBytes(item.file.size)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setItems((prev) => prev.filter((f) => f.id !== item.id))}
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => addInputRef.current?.click()}>
              <FilePlus className="size-3.5" />
              Add more
            </Button>
            <input
              ref={addInputRef}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files))
                e.target.value = ''
              }}
            />
            <Button variant="ghost" size="sm" onClick={() => setItems([])}>
              <Trash2 className="size-3.5" />
              Clear all
            </Button>
          </div>

          <div className="mt-6 border-t border-line pt-4">
            {plan.hasBlocking && !plan.error && (
              <p role="alert" className="mb-3 text-xs text-red-600 dark:text-red-400">
                Resolve the highlighted name conflicts before downloading; two files must not end up
                with the same name.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void downloadRenamedZip()} disabled={!canDownload}>
                <FolderArchive className="size-4" />
                {zipping ? 'Zipping…' : 'Download renamed files (.zip)'}
              </Button>
              {zipping && (
                <ProgressBar
                  className="min-w-40 flex-1"
                  value={totalBytes === 0 ? 100 : (zipProgress / totalBytes) * 100}
                  label="Zipping"
                />
              )}
            </div>
          </div>
        </>
      )}
    </ToolLayout>
  )
}
