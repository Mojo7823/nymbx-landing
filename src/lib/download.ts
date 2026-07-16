import { zip, strToU8, type Zippable } from 'fflate'

/** Trigger a browser download of `blob` as `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Delay revocation so the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export interface ZipEntry {
  /** Path inside the zip; may contain `/` for folders. */
  name: string
  data: Uint8Array | string
}

/** Build a compressed zip from in-memory entries. */
export function createZip(files: ZipEntry[]): Promise<Uint8Array> {
  const tree: Zippable = {}
  for (const { name, data } of files) {
    tree[name] = typeof data === 'string' ? strToU8(data) : data
  }
  return new Promise((resolve, reject) => {
    zip(tree, { level: 6 }, (err, out) => (err ? reject(err) : resolve(out)))
  })
}

/** Zip `files` and download the archive as `zipName`. */
export async function downloadZip(files: ZipEntry[], zipName: string): Promise<void> {
  const out = await createZip(files)
  const bytes = new Uint8Array(out) // re-wrap so the BlobPart type is exact
  downloadBlob(new Blob([bytes], { type: 'application/zip' }), zipName)
}
