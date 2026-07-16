/// <reference lib="webworker" />
import { expose } from 'comlink'
import { hashBlob, type AlgorithmId } from './hashEngine'

const api = {
  /** Stream-hash `file` with every requested algorithm in one pass. */
  hashFile(
    file: Blob,
    algorithms: AlgorithmId[],
    onProgress?: (bytesDone: number) => void,
  ): Promise<Partial<Record<AlgorithmId, string>>> {
    return hashBlob(file, algorithms, onProgress)
  },
}

export type HashWorkerApi = typeof api

expose(api)
