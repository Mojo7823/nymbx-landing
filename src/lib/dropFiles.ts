/**
 * Folder-aware drag-and-drop helpers.
 *
 * Browsers flatten dropped folders into `DataTransfer.files` (losing the
 * directory structure), but `DataTransferItem.webkitGetAsEntry()` preserves
 * it. These helpers traverse dropped directory trees and report each file
 * with its path relative to the drop, e.g. `photos/IMG_1.jpg`.
 *
 * No dependency on any tool — `FileDropzone` uses this when folder drops
 * are enabled. Everything stays client-side.
 */

export interface DroppedPath {
  file: File
  /** Path inside the drop; plain files just use `file.name`. */
  path: string
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) =>
    entry.file(
      (file) => resolve(file),
      (cause) =>
        reject(cause instanceof Error ? cause : new Error('Could not read a dropped file.')),
    ),
  )
}

function readBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) =>
    reader.readEntries(
      (entries) => resolve(entries),
      (cause) =>
        reject(cause instanceof Error ? cause : new Error('Could not read a dropped folder.')),
    ),
  )
}

async function collectEntry(entry: FileSystemEntry, base: string): Promise<DroppedPath[]> {
  if (entry.isFile) {
    return [{ file: await entryFile(entry as FileSystemFileEntry), path: base + entry.name }]
  }
  // `readEntries` may return partial batches — loop until it comes back empty.
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const out: DroppedPath[] = []
  for (;;) {
    const batch = await readBatch(reader)
    if (batch.length === 0) break
    for (const child of batch) {
      out.push(...(await collectEntry(child, `${base}${entry.name}/`)))
    }
  }
  return out
}

/**
 * Traverse a drop's items when at least one is a directory.
 *
 * Returns `null` when the drop holds plain files only (or the entry API is
 * unavailable) so callers can fall back to `dataTransfer.files`, which is
 * simpler and keeps the existing accept/size UX untouched.
 */
export async function collectDroppedPaths(
  dataTransfer: DataTransfer,
): Promise<DroppedPath[] | null> {
  const items = dataTransfer.items
  if (!items) return null
  const entries: FileSystemEntry[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item || item.kind !== 'file') continue
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
    if (entry) entries.push(entry)
  }
  if (!entries.some((entry) => entry.isDirectory)) return null
  const out: DroppedPath[] = []
  for (const entry of entries) {
    out.push(...(await collectEntry(entry, '')))
  }
  return out
}

/** webkitdirectory inputs expose the relative path on each file. */
export function inputFilePath(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return relative && relative.length > 0 ? relative : file.name
}
