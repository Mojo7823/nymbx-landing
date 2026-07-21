/// <reference lib="webworker" />
import { expose } from 'comlink'
import { runRegex, type RegexRunResult } from './regex'

const api = {
  run(pattern: string, flags: string, text: string, replacement?: string): RegexRunResult {
    return runRegex(pattern, flags, text, replacement)
  },
}

export type RegexWorkerApi = typeof api

expose(api)
