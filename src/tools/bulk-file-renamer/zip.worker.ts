/// <reference lib="webworker" />
import { expose } from 'comlink'
import { streamZip, type ZipInput } from './zipStream'

const api = {
  /** Stream `entries` into a compressed zip, reporting source bytes consumed. */
  buildZip(entries: ZipInput[], onProgress?: (bytesDone: number) => void): Promise<Blob> {
    return streamZip(entries, onProgress)
  },
}

export type ZipWorkerApi = typeof api

expose(api)
