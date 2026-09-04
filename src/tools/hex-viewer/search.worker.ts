import { expose, type ProxyMarked } from 'comlink'
import { findByteSequence, type ByteSearchResult } from './search'

export interface SearchWorkerApi {
  find(
    file: File,
    needle: Uint8Array,
    startOffset: number,
    onProgress: ((scanned: number, total: number) => void) & ProxyMarked,
  ): Promise<ByteSearchResult | null>
}

const api: SearchWorkerApi = {
  find(file, needle, startOffset, onProgress) {
    return findByteSequence(file, needle, startOffset, { onProgress })
  },
}

expose(api)
