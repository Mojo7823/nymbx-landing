/// <reference lib="webworker" />
import { expose } from 'comlink'
import { countText, type TextStats } from './count'

const api = {
  count(text: string): TextStats {
    return countText(text)
  },
}

export type CountWorkerApi = typeof api

expose(api)
