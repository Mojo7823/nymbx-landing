import { expose } from 'comlink'
import { computeDiff, unifiedDiff, type Granularity } from './diffEngine'

export interface DiffWorkerApi {
  compute(
    a: string,
    b: string,
    granularity: Granularity,
    ignoreWhitespace: boolean,
  ): ReturnType<typeof computeDiff>
  unified(a: string, b: string, ignoreWhitespace: boolean): string
}

const api: DiffWorkerApi = {
  compute: (a, b, granularity, ignoreWhitespace) =>
    computeDiff(a, b, granularity, ignoreWhitespace),
  unified: (a, b, ignoreWhitespace) => unifiedDiff(a, b, ignoreWhitespace),
}

expose(api)
