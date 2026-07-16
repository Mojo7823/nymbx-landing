import {
  createCRC32,
  createMD5,
  createSHA1,
  createSHA256,
  createSHA512,
  type IHasher,
} from 'hash-wasm'

export type AlgorithmId = 'sha256' | 'sha1' | 'sha512' | 'md5' | 'crc32'

/** Read files in 8 MiB slices so multi-GB inputs never load fully into memory. */
export const CHUNK_SIZE = 8 * 1024 * 1024

const factories: Record<AlgorithmId, () => Promise<IHasher>> = {
  sha256: createSHA256,
  sha1: createSHA1,
  sha512: createSHA512,
  md5: createMD5,
  crc32: createCRC32,
}

/**
 * Stream `blob` through every requested hasher in a single pass over the
 * data. `onProgress` receives the total bytes consumed so far.
 */
export async function hashBlob(
  blob: Blob,
  algorithms: AlgorithmId[],
  onProgress?: (bytesDone: number) => void,
  chunkSize = CHUNK_SIZE,
): Promise<Partial<Record<AlgorithmId, string>>> {
  const hashers = await Promise.all(
    algorithms.map(async (id) => {
      const hasher = await factories[id]()
      hasher.init()
      return [id, hasher] as const
    }),
  )

  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const chunk = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer())
    for (const [, hasher] of hashers) hasher.update(chunk)
    onProgress?.(Math.min(offset + chunkSize, blob.size))
  }

  const result: Partial<Record<AlgorithmId, string>> = {}
  for (const [id, hasher] of hashers) result[id] = hasher.digest('hex')
  return result
}
