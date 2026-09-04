export interface ByteSearchResult {
  offset: number
  wrapped: boolean
}

export interface SearchOptions {
  chunkSize?: number
  onProgress?: (scanned: number, total: number) => void
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  const lastStart = haystack.length - needle.length
  outer: for (let index = from; index <= lastStart; index++) {
    for (let part = 0; part < needle.length; part++) {
      if (haystack[index + part] !== needle[part]) continue outer
    }
    return index
  }
  return -1
}

async function searchRange(
  source: Blob,
  needle: Uint8Array,
  start: number,
  end: number,
  chunkSize: number,
  progress: { scanned: number; total: number; report?: SearchOptions['onProgress'] },
): Promise<number> {
  let position = start
  let carry = new Uint8Array(0)

  while (position < end) {
    const chunkEnd = Math.min(end, position + chunkSize)
    const chunk = new Uint8Array(await source.slice(position, chunkEnd).arrayBuffer())
    const combined = new Uint8Array(carry.length + chunk.length)
    combined.set(carry)
    combined.set(chunk, carry.length)

    const baseOffset = position - carry.length
    const relative = indexOfBytes(combined, needle, Math.max(0, start - baseOffset))
    if (relative !== -1 && baseOffset + relative + needle.length <= end) {
      return baseOffset + relative
    }

    const carryLength = Math.min(needle.length - 1, combined.length)
    carry = combined.slice(combined.length - carryLength)
    progress.scanned += chunk.length
    progress.report?.(Math.min(progress.scanned, progress.total), progress.total)
    position = chunkEnd
  }
  return -1
}

/**
 * Search a Blob using bounded slices. The overlap between chunks is retained,
 * so a match that straddles two reads is still found.
 */
export async function findByteSequence(
  source: Blob,
  needle: Uint8Array,
  startOffset = 0,
  options: SearchOptions = {},
): Promise<ByteSearchResult | null> {
  if (needle.length === 0 || source.size === 0 || needle.length > source.size) return null
  const chunkSize = Math.max(needle.length, options.chunkSize ?? 1024 * 1024)
  const start = Math.min(Math.max(0, startOffset), source.size)
  const progress = { scanned: 0, total: source.size, report: options.onProgress }

  const after = await searchRange(source, needle, start, source.size, chunkSize, progress)
  if (after !== -1) return { offset: after, wrapped: false }
  if (start === 0) return null

  const before = await searchRange(source, needle, 0, start, chunkSize, progress)
  return before === -1 ? null : { offset: before, wrapped: true }
}
