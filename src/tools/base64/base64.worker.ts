/// <reference lib="webworker" />
import { expose } from 'comlink'
import { decodeBase64, fileToBase64, type DecodeResult } from './codec'

const api = {
  encodeFile(file: Blob, urlSafe: boolean, onProgress: (value: number) => void): Promise<string> {
    return fileToBase64(file, urlSafe, onProgress)
  },
  decode(input: string): DecodeResult {
    return decodeBase64(input)
  },
}

export type Base64WorkerApi = typeof api

expose(api)
