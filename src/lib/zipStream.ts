import { Zip, ZipDeflate } from 'fflate'

export interface ZipInput {
  /** Entry name inside the archive. */
  name: string
  blob: Blob
}

/** Read files in 8 MiB slices so multi-GB batches never load fully into memory. */
export const ZIP_CHUNK_SIZE = 8 * 1024 * 1024

/**
 * Build a compressed zip by streaming each blob through fflate in chunks.
 * Only the compressed output accumulates in memory; sources are read one
 * slice at a time. `onProgress` receives total source bytes consumed.
 */
export async function streamZip(
  entries: ZipInput[],
  onProgress?: (bytesDone: number) => void,
  chunkSize = ZIP_CHUNK_SIZE,
): Promise<Blob> {
  const parts: Uint8Array[] = []

  const finished = new Promise<void>((resolve, reject) => {
    const zip = new Zip((err, chunk, final) => {
      if (err) {
        reject(err)
        return
      }
      parts.push(chunk)
      if (final) resolve()
    })

    void (async () => {
      try {
        let bytesDone = 0
        for (const { name, blob } of entries) {
          const file = new ZipDeflate(name, { level: 6 })
          zip.add(file)
          if (blob.size === 0) {
            file.push(new Uint8Array(0), true)
            continue
          }
          for (let offset = 0; offset < blob.size; offset += chunkSize) {
            const end = Math.min(offset + chunkSize, blob.size)
            const chunk = new Uint8Array(await blob.slice(offset, end).arrayBuffer())
            file.push(chunk, end === blob.size)
            bytesDone += chunk.length
            onProgress?.(bytesDone)
          }
        }
        zip.end()
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })()
  })

  await finished
  return new Blob(parts as BlobPart[], { type: 'application/zip' })
}
