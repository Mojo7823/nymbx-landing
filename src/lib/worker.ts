import { wrap, type Remote } from 'comlink'

export interface WorkerHandle<T> {
  api: Remote<T>
  terminate: () => void
}

/**
 * Wrap a Web Worker with Comlink so its exposed API can be called as
 * async functions. Usage in a tool:
 *
 *   const { api, terminate } = wrapWorker<MyWorkerApi>(
 *     new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
 *   )
 *   const result = await api.doHeavyThing(input)
 *
 * The worker module must call `expose()` (from comlink) on its API object.
 */
export function wrapWorker<T>(worker: Worker): WorkerHandle<T> {
  return {
    api: wrap<T>(worker),
    terminate: () => worker.terminate(),
  }
}
