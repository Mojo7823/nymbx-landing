/// <reference lib="webworker" />
import { expose } from 'comlink'
import { formatJson, minifyJson, validateJson, type ProcessResult } from './jsonTools'

export type JsonMode = 'format' | 'minify' | 'validate'

const api = {
  process(text: string, mode: JsonMode, indent: string): ProcessResult {
    if (mode === 'format') return formatJson(text, indent)
    if (mode === 'minify') return minifyJson(text)
    return validateJson(text)
  },
}

export type JsonWorkerApi = typeof api

expose(api)
