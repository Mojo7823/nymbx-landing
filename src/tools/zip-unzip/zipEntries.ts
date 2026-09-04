/**
 * Pure zip-entry helpers for the Zip / unzip tool: entry-name sanitizing
 * (zip-slip protection), create-plan collision detection, explicit directory
 * entries, central-directory parsing (fast listing without decompressing),
 * and small byte utilities.
 *
 * No DOM here — the whole module runs in Vitest and inside the tool's
 * Web Worker (see `zipTool.ts` / `zipTool.worker.ts`).
 */

export interface ZipEntryInfo {
  /** Sanitized in-archive path, e.g. `photos/a.jpg` or `docs/` for folders. */
  name: string
  compressedSize: number
  /** Uncompressed size in bytes (always present — read from the directory). */
  size: number
  isDirectory: boolean
  /** General-purpose bit 0: the entry is password-protected (unsupported). */
  encrypted: boolean
  /** PKZIP compression method (0 = stored, 8 = deflated). */
  method: number
}

/**
 * Make an in-archive name safe: forward slashes only, no drive letters,
 * no absolute paths, no `.`/`..` escapes. Returns `''` when nothing
 * usable remains. Unicode names pass through untouched.
 */
export function sanitizeEntryName(raw: string): string {
  const withSlashes = raw.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  const isDir = /\/$/.test(raw)
  const parts: string[] = []
  for (const segment of withSlashes.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      parts.pop()
      continue
    }
    parts.push(segment)
  }
  const clean = parts.join('/')
  if (clean === '') return ''
  return isDir ? `${clean}/` : clean
}

export interface CreateInput {
  /** Original file name (for messages). */
  name: string
  /** Desired in-archive path (relative path for folder drops). */
  path: string
}

export type CreateRowStatus = 'ok' | 'duplicate' | 'invalid'

export interface CreateRow extends CreateInput {
  entryName: string
  status: CreateRowStatus
  /** Human reason for non-ok rows. */
  reason: string
}

export interface CreatePlan {
  rows: CreateRow[]
  hasBlocking: boolean
  okCount: number
}

/**
 * Map dropped files to in-archive names and flag anything that would make
 * the zip ambiguous: empty names, exact duplicates, and file/folder path
 * collisions (e.g. a file `a` next to a file `a/b.txt`). The UI blocks the
 * download while any row is non-ok instead of guessing.
 */
export function planCreateEntries(items: CreateInput[]): CreatePlan {
  const rows: CreateRow[] = items.map((item) => ({
    ...item,
    entryName: sanitizeEntryName(item.path || item.name),
    status: 'ok' as CreateRowStatus,
    reason: '',
  }))

  const byName = new Map<string, number[]>()
  rows.forEach((row, index) => {
    if (row.entryName === '') return
    const list = byName.get(row.entryName) ?? []
    list.push(index)
    byName.set(row.entryName, list)
  })

  rows.forEach((row, index) => {
    if (row.entryName === '') {
      row.status = 'invalid'
      row.reason = 'The name is empty after removing unsafe parts.'
      return
    }
    const dupes = (byName.get(row.entryName) ?? []).filter((other) => other !== index)
    if (dupes.length > 0) {
      row.status = 'duplicate'
      row.reason = `Same in-zip name as “${rows[dupes[0]!]!.path}”.`
      return
    }
    for (let other = 0; other < rows.length; other++) {
      if (other === index || rows[other]!.entryName === '') continue
      const otherName = rows[other]!.entryName
      if (
        otherName !== row.entryName &&
        (otherName.startsWith(`${row.entryName}/`) || row.entryName.startsWith(`${otherName}/`))
      ) {
        row.status = 'duplicate'
        row.reason = `Collides with the folder path of “${rows[other]!.path}”.`
        break
      }
    }
  })

  return {
    rows,
    hasBlocking: rows.some((row) => row.status !== 'ok'),
    okCount: rows.filter((row) => row.status === 'ok').length,
  }
}

/**
 * Add explicit `dir/` entries for every implied parent folder so the
 * structure survives the round trip visibly. Deterministic (sorted).
 */
export function withDirectoryEntries(names: string[]): string[] {
  const dirs = new Set<string>()
  for (const name of names) {
    const segments = name.split('/')
    for (let depth = 1; depth < segments.length; depth++) {
      dirs.add(`${segments.slice(0, depth).join('/')}/`)
    }
  }
  return [...names, ...[...dirs].sort()]
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export interface ZipDirectoryMeta {
  entryCount: number
  cdOffset: number
  cdSize: number
}

const EOCD_SIG = 0x06054b50
const CD_SIG = 0x02014b50
const ZIP64_U16 = 0xffff
const ZIP64_U32 = 0xffffffff

const utf8 = new TextDecoder('utf-8')

/**
 * Locate the end-of-central-directory record in the archive's trailing
 * bytes. `tail` MUST extend to the end of the file; the worker reads the
 * last 64 KiB + 22 bytes, which always contains the record.
 */
export function findEndOfCentralDirectory(tail: Uint8Array): ZipDirectoryMeta {
  if (tail.length < 22) throw new Error('Not a zip archive: the file is too small.')
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  // Scan backwards: the record is last, and a comment may contain lookalikes.
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) !== EOCD_SIG) continue
    if (i + 22 + view.getUint16(i + 20, true) !== tail.length) continue
    const diskNo = view.getUint16(i + 4, true)
    const cdDisk = view.getUint16(i + 6, true)
    const entriesThisDisk = view.getUint16(i + 8, true)
    const entryCount = view.getUint16(i + 10, true)
    const cdSize = view.getUint32(i + 12, true)
    const cdOffset = view.getUint32(i + 16, true)
    if (diskNo !== 0 || cdDisk !== 0 || entriesThisDisk !== entryCount) {
      throw new Error('Spanned (multi-disk) archives are not supported.')
    }
    if (entryCount === ZIP64_U16 || cdSize === ZIP64_U32 || cdOffset === ZIP64_U32) {
      throw new Error('Zip64 archives are not supported.')
    }
    return { entryCount, cdOffset, cdSize }
  }
  throw new Error('Not a zip archive: end-of-central-directory record not found.')
}

/**
 * Parse exactly `expectedCount` central-directory headers. Throws on
 * truncation, bad signatures, or Zip64 markers — never returns guesses.
 */
export function parseCentralDirectory(cd: Uint8Array, expectedCount: number): ZipEntryInfo[] {
  const view = new DataView(cd.buffer, cd.byteOffset, cd.byteLength)
  const entries: ZipEntryInfo[] = []
  let pos = 0
  for (let n = 0; n < expectedCount; n++) {
    if (pos + 46 > cd.length) throw new Error('This zip archive looks truncated.')
    if (view.getUint32(pos, true) !== CD_SIG) {
      throw new Error('This zip archive is corrupt (bad central directory).')
    }
    const flags = view.getUint16(pos + 8, true)
    const method = view.getUint16(pos + 10, true)
    const compressedSize = view.getUint32(pos + 20, true)
    const size = view.getUint32(pos + 24, true)
    const nameLen = view.getUint16(pos + 28, true)
    const extraLen = view.getUint16(pos + 30, true)
    const commentLen = view.getUint16(pos + 32, true)
    if (compressedSize === ZIP64_U32 || size === ZIP64_U32) {
      throw new Error('Zip64 archives are not supported.')
    }
    const nameStart = pos + 46
    if (nameStart + nameLen + extraLen + commentLen > cd.length) {
      throw new Error('This zip archive looks truncated.')
    }
    const rawName = utf8.decode(cd.subarray(nameStart, nameStart + nameLen))
    const name = sanitizeEntryName(rawName)
    if (name !== '') {
      entries.push({
        name,
        compressedSize,
        size,
        isDirectory: rawName.endsWith('/'),
        encrypted: (flags & 0x1) !== 0,
        method,
      })
    }
    pos = nameStart + nameLen + extraLen + commentLen
  }
  return entries
}
