import { useEffect, useMemo, useRef, useState } from 'react'
import { proxy } from 'comlink'
import { Braces, FilePlus, FileText, FolderInput, Sheet, Trash2, X } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { FileDropzone } from '../../components/FileDropzone'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { ProgressBar } from '../../components/ProgressBar'
import { cx } from '../../lib/cx'
import { formatBytes } from '../../lib/format'
import { downloadBlob } from '../../lib/download'
import { toast } from '../../lib/toast'
import { inputFilePath, type DroppedPath } from '../../lib/dropFiles'
import { createProgressGuard, wrapWorker, type WorkerHandle } from '../../lib/worker'
import type { AlgorithmId } from './hashEngine'
import {
  algorithmLabels,
  algorithmOrder,
  buildCsv,
  buildTxt,
  buildVerifyCsv,
  buildVerifyJson,
  buildVerifyTxt,
  normalizeExpected,
  type HashRow,
} from './hashLogic'
import { looksLikeManifestName, parseManifest, preferredManifest, type Manifest } from './manifest'
import { buildRows, commonRoot, summarize } from './verify'
import { ManifestCard, type ManifestCandidate } from './ManifestCard'
import { VerifyTable } from './VerifyTable'
import type { HashWorkerApi } from './hash.worker'

/** Manifest files are text; anything larger is not one. */
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024

interface FileItem {
  id: number
  file: File
  /** Path relative to the drop (`release/bin/tool.js`), else the file name. */
  path: string
  status: 'queued' | 'hashing' | 'done' | 'error'
  /** Bytes hashed so far, for the per-file progress bar. */
  bytesDone: number
  /** Every hash computed so far — kept when an algorithm is toggled off. */
  hashes: Partial<Record<AlgorithmId, string>>
  error?: string
}

let nextId = 1

export default function BulkFileHasher() {
  const [items, setItems] = useState<FileItem[]>([])
  const [enabled, setEnabled] = useState<Record<AlgorithmId, boolean>>({
    sha256: true,
    sha1: false,
    sha512: false,
    sha384: false,
    md5: false,
    blake2b: false,
    crc32: false,
  })
  const [expected, setExpected] = useState('')
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [manifestPath, setManifestPath] = useState<string | null>(null)
  const [manifestFileId, setManifestFileId] = useState<number | undefined>(undefined)
  const [candidates, setCandidates] = useState<ManifestCandidate[]>([])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteNote, setPasteNote] = useState('')
  const [filter, setFilter] = useState<'all' | 'problems'>('all')

  const workerRef = useRef<WorkerHandle<HashWorkerApi> | null>(null)
  const runningRef = useRef(false)
  const itemsRef = useRef(items)
  const enabledRef = useRef(enabled)
  const addInputRef = useRef<HTMLInputElement>(null)
  const addFolderInputRef = useRef<HTMLInputElement>(null)
  const manifestRef = useRef(manifest)
  const manifestFileIdRef = useRef(manifestFileId)
  /** True while the active manifest came from the paste box (so clearing the box removes it). */
  const pasteAdoptedRef = useRef(false)
  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mirror the latest state into refs so the long-running hash loop below
  // (which spans many renders) always sees the current queue and selection.
  useEffect(() => {
    itemsRef.current = items
    enabledRef.current = enabled
    manifestRef.current = manifest
    manifestFileIdRef.current = manifestFileId
  }, [items, enabled, manifest, manifestFileId])

  function getWorker() {
    workerRef.current ??= wrapWorker<HashWorkerApi>(
      new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' }),
    )
    return workerRef.current
  }

  useEffect(
    () => () => {
      workerRef.current?.terminate()
    },
    [],
  )

  const selected = algorithmOrder.filter((a) => enabled[a])

  // Hash sequentially: one worker, one file at a time, single pass per file
  // covering every algorithm that file is still missing.
  useEffect(() => {
    if (runningRef.current) return
    const wanted = algorithmOrder.filter((a) => enabledRef.current[a])
    // The adopted manifest is never hashed — it describes the other files.
    const hashable = (i: FileItem) => i.id !== manifestFileIdRef.current
    const pending = items.some(
      (i) => hashable(i) && i.status !== 'error' && wanted.some((a) => i.hashes[a] === undefined),
    )
    if (!pending || wanted.length === 0) return

    runningRef.current = true
    void (async () => {
      // itemsRef lags behind setItems until React re-renders, so track the
      // hashes finished during this run locally — otherwise the loop would
      // pick the same file again.
      const computed = new Map<number, Partial<Record<AlgorithmId, string>>>()
      const failed = new Set<number>()
      const haveFor = (i: FileItem) => ({ ...i.hashes, ...computed.get(i.id) })
      try {
        for (;;) {
          const algos = algorithmOrder.filter((a) => enabledRef.current[a])
          if (algos.length === 0) break
          const item = itemsRef.current.find(
            (i) =>
              hashable(i) &&
              i.status !== 'error' &&
              !failed.has(i.id) &&
              algos.some((a) => haveFor(i)[a] === undefined),
          )
          if (!item) break
          const missing = algos.filter((a) => haveFor(item)[a] === undefined)
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, status: 'hashing', bytesDone: 0 } : i)),
          )
          // Guarded: a late Comlink tick must not touch state after this
          // file finished (see createProgressGuard in lib/worker.ts).
          const guard = createProgressGuard((bytesDone: number) => {
            setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, bytesDone } : i)))
          })
          try {
            const hashes = await getWorker().api.hashFile(
              item.file,
              missing,
              proxy(guard.onProgress),
            )
            computed.set(item.id, { ...computed.get(item.id), ...hashes })
            setItems((prev) =>
              prev.map((i) =>
                i.id === item.id ? { ...i, status: 'done', hashes: { ...i.hashes, ...hashes } } : i,
              ),
            )
          } catch (err) {
            failed.add(item.id)
            const message =
              err instanceof Error && err.message ? err.message : 'Could not read this file'
            setItems((prev) =>
              prev.map((i) => (i.id === item.id ? { ...i, status: 'error', error: message } : i)),
            )
          } finally {
            guard.settle()
          }
        }
      } finally {
        runningRef.current = false
        // Re-render so the effect re-checks for work that arrived while the
        // final iteration was still in flight.
        setItems((prev) => [...prev])
      }
    })()
  }, [items, enabled, manifestFileId])

  function adoptManifest(next: Manifest, path: string | null, fileId?: number, fromPaste = false) {
    setManifest(next)
    setManifestPath(path)
    setManifestFileId(fileId)
    pasteAdoptedRef.current = fromPaste
    manifestRef.current = next
    manifestFileIdRef.current = fileId
    // Only ever enable — never silently untick what the user chose.
    setEnabled((prev) => {
      const updated = { ...prev }
      for (const algo of next.algorithms) updated[algo] = true
      return updated
    })
    if (!fromPaste) toast(`Using ${next.name} as the manifest`, { variant: 'success' })
  }

  function removeManifest() {
    setManifest(null)
    setManifestPath(null)
    setManifestFileId(undefined)
    pasteAdoptedRef.current = false
    setPasteText('')
    setPasteNote('')
    manifestRef.current = null
    manifestFileIdRef.current = undefined
  }

  /**
   * Parse the checksum files among freshly added items, remember them (so
   * they are never reported EXTRA) and adopt one when it is unambiguous.
   */
  async function inspectManifests(added: FileItem[]) {
    const found: ManifestCandidate[] = []
    for (const item of added) {
      if (!looksLikeManifestName(item.path) || item.file.size > MAX_MANIFEST_BYTES) continue
      try {
        const parsed = parseManifest(await item.file.text(), item.file.name)
        if (parsed.entries.length > 0) {
          found.push({ id: item.id, path: item.path, name: item.file.name, manifest: parsed })
        }
      } catch {
        // Unreadable candidate — treat it as an ordinary file.
      }
    }
    if (found.length === 0) return
    setCandidates((prev) => [...prev, ...found])
    const best = preferredManifest(found)
    if (manifestRef.current === null && best) {
      adoptManifest(best.manifest, best.path, best.id)
    }
  }

  function addPaths(paths: DroppedPath[]) {
    const added = paths.map(({ file, path }): FileItem => ({
      id: nextId++,
      file,
      path,
      status: 'queued',
      bytesDone: 0,
      hashes: {},
    }))
    setItems((prev) => [...prev, ...added])
    void inspectManifests(added)
  }

  function addFiles(files: File[]) {
    addPaths(files.map((file) => ({ file, path: file.name })))
  }

  async function chooseManifestFile(file: File) {
    const parsed = parseManifest(await file.text(), file.name)
    if (parsed.entries.length === 0) {
      toast(`No checksum lines found in ${file.name}`, { variant: 'error' })
      return
    }
    adoptManifest(parsed, null)
  }

  // Paste parsing runs 200 ms after the last keystroke. The timer lives in a
  // ref and is armed by the change handler, so no effect needs to depend on
  // the (re-created) handlers and no lint rule has to be silenced.
  useEffect(
    () => () => {
      if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current)
    },
    [],
  )

  function applyPaste(raw: string) {
    if (raw.trim() === '') {
      setPasteNote('')
      if (pasteAdoptedRef.current) removeManifest()
      return
    }
    const parsed = parseManifest(raw)
    if (parsed.entries.length === 0) {
      setPasteNote('No checksum lines found.')
      return
    }
    setPasteNote('')
    adoptManifest(parsed, null, undefined, true)
  }

  function onPasteChange(text: string) {
    setPasteText(text)
    if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current)
    pasteTimerRef.current = setTimeout(() => applyPaste(text), 200)
  }

  const expectedNorm = normalizeExpected(expected)
  const matches = useMemo(() => {
    if (!expectedNorm) return []
    return items.flatMap((item) =>
      selected
        .filter((a) => item.hashes[a] === expectedNorm)
        .map((a) => ({ name: item.file.name, algo: a })),
    )
  }, [items, selected, expectedNorm])
  const allSettled =
    items.length > 0 && items.every((i) => i.status === 'done' || i.status === 'error')

  // Where the manifest sits, so entry paths resolve against the drop. A
  // manifest picked with the file input has no path of its own — fall back
  // to the single folder every dropped file shares.
  const effectiveManifestPath =
    manifestPath ??
    (manifest ? (commonRoot(items.map((i) => i.path))?.concat('/', manifest.name) ?? null) : null)

  const manifestFileIds = useMemo(() => {
    const ids = new Set(candidates.map((c) => c.id))
    if (manifestFileId !== undefined) ids.add(manifestFileId)
    return ids
  }, [candidates, manifestFileId])

  const verifyRows = useMemo(() => {
    if (!manifest) return []
    const byId = new Map(items.map((i) => [i.id, i]))
    return buildRows(
      manifest,
      items.map((i) => ({ id: i.id, path: i.path, size: i.file.size })),
      {
        manifestPath: effectiveManifestPath,
        hashes: (id) => byId.get(id)?.hashes ?? {},
        status: (id) => byId.get(id)?.status ?? 'queued',
        manifestFileIds,
      },
    )
  }, [manifest, items, effectiveManifestPath, manifestFileIds])
  const verifySummary = useMemo(() => summarize(verifyRows), [verifyRows])

  const missingAlgorithms = manifest ? manifest.algorithms.filter((a) => !enabled[a]) : []
  const canExportReport = manifest !== null && verifyRows.length > 0 && verifySummary.pending === 0

  function hashProgress(fileId: number): number | null {
    const item = items.find((i) => i.id === fileId)
    if (!item || item.status !== 'hashing') return null
    return item.file.size === 0 ? 100 : (item.bytesDone / item.file.size) * 100
  }

  function exportReport(kind: 'txt' | 'csv' | 'json') {
    if (!manifest) return
    const body =
      kind === 'txt'
        ? buildVerifyTxt(verifyRows, verifySummary, manifest)
        : kind === 'csv'
          ? buildVerifyCsv(verifyRows)
          : buildVerifyJson(verifyRows, verifySummary, manifest)
    const type = kind === 'csv' ? 'text/csv' : kind === 'json' ? 'application/json' : 'text/plain'
    downloadBlob(new Blob([body], { type }), `verify-report.${kind}`)
  }

  const exportRows: HashRow[] = items
    .filter((i) => i.status === 'done')
    .map((i) => ({ name: i.file.name, size: i.file.size, hashes: i.hashes }))
  // Require a selected algorithm too — otherwise the export would be an
  // empty TXT / header-only CSV.
  const canExport = exportRows.length > 0 && selected.length > 0

  function exportCsv() {
    downloadBlob(new Blob([buildCsv(exportRows, selected)], { type: 'text/csv' }), 'hashes.csv')
  }

  function exportTxt() {
    downloadBlob(new Blob([buildTxt(exportRows, selected)], { type: 'text/plain' }), 'hashes.txt')
  }

  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0)

  return (
    <ToolLayout
      title="Bulk file hasher"
      description="Compute SHA-256, SHA-1, SHA-512, SHA-384, MD5, BLAKE2b and CRC32 checksums for any number of files, or verify a folder against a checksum manifest. Files are streamed in your browser; nothing is uploaded."
      badge="client-side"
    >
      {/* Settings */}
      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-line bg-card p-4">
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <legend className="sr-only">Hash algorithms</legend>
          <span className="text-xs font-medium text-muted">Algorithms</span>
          {algorithmOrder.map((a) => (
            <label
              key={a}
              className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink"
            >
              <input
                type="checkbox"
                checked={enabled[a]}
                onChange={(e) => setEnabled((prev) => ({ ...prev, [a]: e.target.checked }))}
                className="size-3.5 accent-(--color-pine)"
              />
              {algorithmLabels[a]}
            </label>
          ))}
          {selected.length === 0 && (
            <p className="text-xs text-amber-badge">Select at least one algorithm.</p>
          )}
        </fieldset>

        <div className="border-t border-line pt-3">
          <ManifestCard
            manifest={manifest}
            candidates={manifest ? [] : candidates}
            missingAlgorithms={missingAlgorithms}
            pasteOpen={pasteOpen}
            pasteText={pasteText}
            pasteNote={pasteNote}
            onPasteToggle={() => setPasteOpen((v) => !v)}
            onPasteChange={onPasteChange}
            onChooseFile={(file) => void chooseManifestFile(file)}
            onAdopt={(candidate) => adoptManifest(candidate.manifest, candidate.path, candidate.id)}
            onRemove={removeManifest}
            onEnableAlgorithms={() =>
              setEnabled((prev) => {
                const updated = { ...prev }
                for (const algo of missingAlgorithms) updated[algo] = true
                return updated
              })
            }
          />
        </div>

        {!manifest && (
          <>
            <label className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-xs font-medium text-muted">Verify against</span>
              <input
                type="text"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder="Paste an expected hash (or a sha256sum line)…"
                spellCheck={false}
                className="h-8 min-w-0 flex-1 basis-64 rounded-md border border-line-strong bg-card px-2 font-mono text-xs text-ink focus:border-pine focus:outline-none"
              />
            </label>
            {expectedNorm && (
              <p
                role="status"
                className={cx(
                  'font-mono text-xs',
                  matches.length > 0
                    ? 'text-pine'
                    : allSettled
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted',
                )}
              >
                {matches.length > 0
                  ? matches
                      .map((m) => `✓ Matches ${algorithmLabels[m.algo]} of ${m.name}`)
                      .join(' · ')
                  : allSettled
                    ? '✗ No file matches the expected hash'
                    : items.length === 0
                      ? 'Add files to compare'
                      : 'No match yet…'}
              </p>
            )}
          </>
        )}
      </div>

      {/* Input */}
      {items.length === 0 ? (
        <FileDropzone
          multiple
          folders
          onPaths={addPaths}
          hint="Any file type, any size. Large files are hashed in chunks — drop a folder with its SHA256SUMS to verify it"
        />
      ) : (
        <>
          <p className="mb-3 font-mono text-[11px] text-muted tabular-nums">
            {items.length} {items.length === 1 ? 'file' : 'files'} · {formatBytes(totalBytes)}
          </p>

          {manifest ? (
            <VerifyTable
              rows={verifyRows}
              summary={verifySummary}
              manifestName={manifest.name}
              filter={filter}
              onFilterChange={setFilter}
              progress={hashProgress}
              onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
            />
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="rounded-lg border border-line bg-card px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {item.path}
                      </span>
                      <span className="font-mono text-[11px] text-muted tabular-nums">
                        {formatBytes(item.file.size)}
                        {item.status === 'queued' && ' · queued'}
                        {item.status === 'error' && (
                          <span className="text-red-600 dark:text-red-400"> · {item.error}</span>
                        )}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>

                  {item.status === 'hashing' && (
                    <ProgressBar
                      className="mt-2"
                      value={item.file.size === 0 ? 100 : (item.bytesDone / item.file.size) * 100}
                      label="Hashing"
                    />
                  )}

                  {selected.some((a) => item.hashes[a]) && (
                    <dl className="mt-2 space-y-1 border-t border-line pt-2">
                      {selected.map((a) => {
                        const hash = item.hashes[a]
                        if (!hash) return null
                        const isMatch = expectedNorm !== '' && hash === expectedNorm
                        return (
                          <div key={a} className="flex items-start gap-2">
                            <dt className="w-16 shrink-0 pt-0.5 font-mono text-[11px] text-muted">
                              {algorithmLabels[a]}
                            </dt>
                            <dd
                              className={cx(
                                'min-w-0 flex-1 pt-0.5 font-mono text-xs break-all',
                                isMatch ? 'font-semibold text-pine' : 'text-ink',
                              )}
                            >
                              {hash}
                              {isMatch && <span className="ml-1.5">✓</span>}
                            </dd>
                            <CopyButton
                              text={hash}
                              label=""
                              aria-label={`Copy ${algorithmLabels[a]} of ${item.file.name}`}
                              className="shrink-0"
                            />
                          </div>
                        )
                      })}
                    </dl>
                  )}
                </li>
              ))}
            </ul>
          )}

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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addFolderInputRef.current?.click()}
            >
              <FolderInput className="size-3.5" />
              Add folder
            </Button>
            <input
              ref={(el) => {
                addFolderInputRef.current = el
                // React has no webkitdirectory prop — set the attribute directly.
                el?.setAttribute('webkitdirectory', '')
                el?.setAttribute('directory', '')
              }}
              type="file"
              multiple
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setItems([])
                setCandidates([])
                removeManifest()
              }}
            >
              <Trash2 className="size-3.5" />
              Clear all
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={exportCsv} disabled={!canExport}>
              <Sheet className="size-4" />
              Export CSV
            </Button>
            <Button variant="secondary" onClick={exportTxt} disabled={!canExport}>
              <FileText className="size-4" />
              Export TXT
            </Button>
          </div>

          {manifest && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted">Export report</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportReport('txt')}
                disabled={!canExportReport}
              >
                <FileText className="size-3.5" />
                TXT
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportReport('csv')}
                disabled={!canExportReport}
              >
                <Sheet className="size-3.5" />
                CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportReport('json')}
                disabled={!canExportReport}
              >
                <Braces className="size-3.5" />
                JSON
              </Button>
            </div>
          )}
        </>
      )}
    </ToolLayout>
  )
}
