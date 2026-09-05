import type { AlgorithmId } from './hashEngine'
import type { Manifest, ManifestEntry } from './manifest'

/**
 * Matching dropped files against manifest entries, and turning the pair into
 * verification rows. Pure: the page supplies the hashes and per-file status.
 */

export type VerifyStatus =
  'pass' | 'fail' | 'missing' | 'extra' | 'pending' | 'unsupported' | 'error'

export type MatchedBy = 'path' | 'name' | 'case' | 'separators'

export interface VerifyRow {
  status: VerifyStatus
  /** Manifest path for entries, dropped path for extras. */
  path: string
  entry?: ManifestEntry
  /** The matched file. */
  fileId?: number
  /** The matched file's dropped path, when it differs from `path`. */
  filePath?: string
  /** Computed digest (pass/fail). */
  actual?: string
  /** How the file was found; undefined for an exact path match. */
  matchedBy?: MatchedBy
  size?: number
  note?: string
}

export interface VerifySummary {
  pass: number
  fail: number
  missing: number
  extra: number
  pending: number
  unsupported: number
  error: number
  total: number
}

export type FileStatus = 'queued' | 'hashing' | 'done' | 'error'

export interface FileLike {
  id: number
  /** Path as dropped, e.g. `release/bin/tool.wasm`. */
  path: string
  size: number
}

/** Unicode-normalise and drop a leading `./` so both sides compare alike. */
function normalize(path: string): string {
  const nfc = path.normalize('NFC')
  return nfc.startsWith('./') ? nfc.slice(2) : nfc
}

/**
 * Express `filePath` relative to the folder the manifest sits in, so a
 * manifest dropped at `release/SHA256SUMS` matches `release/bin/tool.wasm`
 * against its own `bin/tool.wasm` entry.
 */
export function relativeToManifest(filePath: string, manifestPath: string | null): string {
  const file = normalize(filePath)
  if (!manifestPath) return file
  const manifest = normalize(manifestPath)
  const slash = manifest.lastIndexOf('/')
  if (slash < 0) return file
  const dir = manifest.slice(0, slash + 1)
  return file.startsWith(dir) ? file.slice(dir.length) : file
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path
}

function uniqueIndex<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  const out = new Map<string, T>()
  for (const item of items) {
    const k = key(item)
    if (counts.get(k) === 1) out.set(k, item)
  }
  return out
}

/**
 * Match entries to files in four passes, each over the still-unmatched
 * entries and files only: exact path, `\` → `/`, case-insensitive, then a
 * unique-basename fallback. `files` must already carry paths relative to
 * the manifest (see `relativeToManifest`).
 */
export function matchFiles(
  entries: ManifestEntry[],
  files: { id: number; path: string }[],
): Map<number, { id: number; matchedBy?: MatchedBy }> {
  const result = new Map<number, { id: number; matchedBy?: MatchedBy }>()
  let openEntries = entries.map((entry, index) => ({ index, path: normalize(entry.path) }))
  let openFiles = files.map((file) => ({ id: file.id, path: normalize(file.path) }))

  const passes: { by?: MatchedBy; key: (path: string) => string }[] = [
    { key: (p) => p },
    { by: 'separators', key: (p) => p.replaceAll('\\', '/') },
    { by: 'case', key: (p) => p.replaceAll('\\', '/').toLowerCase() },
    { by: 'name', key: (p) => baseName(p.replaceAll('\\', '/')).toLowerCase() },
  ]

  for (const pass of passes) {
    // The basename pass must stay unambiguous on both sides; the earlier
    // passes prefer the first file when two dropped paths collapse together.
    const index =
      pass.by === 'name'
        ? uniqueIndex(openFiles, (f) => pass.key(f.path))
        : new Map(openFiles.map((f) => [pass.key(f.path), f] as const).reverse())
    const entryKeys = pass.by === 'name' ? uniqueIndex(openEntries, (e) => pass.key(e.path)) : null

    const takenFiles = new Set<number>()
    const takenEntries = new Set<number>()
    for (const entry of openEntries) {
      const key = pass.key(entry.path)
      if (entryKeys && entryKeys.get(key)?.index !== entry.index) continue
      const file = index.get(key)
      if (!file || takenFiles.has(file.id)) continue
      result.set(entry.index, { id: file.id, ...(pass.by ? { matchedBy: pass.by } : {}) })
      takenFiles.add(file.id)
      takenEntries.add(entry.index)
    }
    openEntries = openEntries.filter((e) => !takenEntries.has(e.index))
    openFiles = openFiles.filter((f) => !takenFiles.has(f.id))
    if (openEntries.length === 0 || openFiles.length === 0) break
  }

  return result
}

export interface BuildRowsOptions {
  /** Where the manifest itself was dropped, for `relativeToManifest`. */
  manifestPath?: string | null
  hashes: (id: number) => Partial<Record<AlgorithmId, string>>
  status: (id: number) => FileStatus
  /** Files that are checksum manifests themselves — never reported EXTRA. */
  manifestFileIds?: ReadonlySet<number>
}

export function buildRows(
  manifest: Manifest,
  files: FileLike[],
  options: BuildRowsOptions,
): VerifyRow[] {
  const { manifestPath = null, hashes, status, manifestFileIds } = options
  const relative = new Map(files.map((f) => [f.id, relativeToManifest(f.path, manifestPath)]))
  const byId = new Map(files.map((f) => [f.id, f]))
  const matches = matchFiles(
    manifest.entries,
    files.map((f) => ({ id: f.id, path: relative.get(f.id)! })),
  )

  const rows: VerifyRow[] = []
  const matchedIds = new Set<number>()

  manifest.entries.forEach((entry, index) => {
    const match = matches.get(index)
    const file = match ? byId.get(match.id) : undefined
    if (file) matchedIds.add(file.id)

    const base: VerifyRow = {
      status: 'missing',
      path: entry.path,
      entry,
      ...(file ? { fileId: file.id, filePath: file.path, size: file.size } : {}),
      ...(match?.matchedBy ? { matchedBy: match.matchedBy } : {}),
    }

    if (entry.algorithm === null) {
      rows.push({
        ...base,
        status: 'unsupported',
        note: entry.tag ? `${entry.tag} is not supported` : 'unknown algorithm',
      })
      return
    }
    if (!file) {
      rows.push({ ...base, status: 'missing', note: 'not in the dropped files' })
      return
    }
    if (status(file.id) === 'error') {
      rows.push({ ...base, status: 'error', note: 'could not be read' })
      return
    }
    const actual = hashes(file.id)[entry.algorithm]
    if (actual === undefined) {
      rows.push({ ...base, status: 'pending' })
      return
    }
    rows.push({
      ...base,
      status: actual.toLowerCase() === entry.digest ? 'pass' : 'fail',
      actual: actual.toLowerCase(),
    })
  })

  for (const file of files) {
    if (matchedIds.has(file.id)) continue
    if (manifestFileIds?.has(file.id)) continue
    rows.push({
      status: 'extra',
      path: file.path,
      fileId: file.id,
      size: file.size,
      note: 'not in the manifest',
    })
  }

  return rows
}

export function summarize(rows: VerifyRow[]): VerifySummary {
  const summary: VerifySummary = {
    pass: 0,
    fail: 0,
    missing: 0,
    extra: 0,
    pending: 0,
    unsupported: 0,
    error: 0,
    total: rows.length,
  }
  for (const row of rows) summary[row.status]++
  return summary
}

/** Rows the `Problems only` filter keeps. */
export function isProblem(row: VerifyRow): boolean {
  return row.status === 'fail' || row.status === 'missing' || row.status === 'error'
}

export const statusLabels: Record<VerifyStatus, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  missing: 'MISSING',
  extra: 'EXTRA',
  pending: 'PENDING',
  unsupported: 'UNSUPPORTED',
  error: 'ERROR',
}

/**
 * The single top-level folder every path shares, e.g. `release` for
 * `release/bin/tool.js` + `release/README.md`. Used when a manifest is
 * picked with the file input (no path of its own) but the files were added
 * as a folder, so its entries are still relative to that folder.
 */
export function commonRoot(paths: string[]): string | null {
  if (paths.length === 0) return null
  const roots = new Set<string>()
  for (const path of paths) {
    const slash = normalize(path).indexOf('/')
    if (slash < 0) return null
    roots.add(normalize(path).slice(0, slash))
  }
  return roots.size === 1 ? [...roots][0]! : null
}
