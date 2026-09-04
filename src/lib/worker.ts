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

export interface ProgressGuard<T extends unknown[] = unknown[]> {
  /** Wrap with Comlink `proxy()` and pass to the worker as its progress callback. */
  onProgress: (...args: T) => void
  /**
   * Call once the worker call settles (in `finally`). Ticks arriving
   * afterwards are dropped instead of resurrecting cleared progress state.
   */
  settle: () => void
}

/**
 * Guard a worker progress callback against late ticks.
 *
 * Comlink delivers `proxy()` callback messages on a different port than the
 * call response, so their ordering is NOT guaranteed: a progress tick sent
 * before the worker resolved can arrive AFTER the `await` already continued.
 * Without this guard, that tick re-sets progress state the `finally` block
 * just cleared and sticks the UI on "Working…" forever (observed in the Zip
 * tool on back-to-back downloads). Message handling on the main thread is
 * sequential, so checking the flag at handling time is airtight: a tick is
 * either processed before `settle()` (and cleared right after) or dropped.
 *
 * Usage:
 *
 *   const guard = createProgressGuard((done: number) => setProgress(done))
 *   try {
 *     await api.doHeavyThing(input, proxy(guard.onProgress))
 *   } finally {
 *     guard.settle()
 *     setProgress(null)
 *   }
 */
export function createProgressGuard<T extends unknown[]>(
  onProgress: (...args: T) => void,
): ProgressGuard<T> {
  let settled = false
  return {
    onProgress: (...args: T) => {
      if (!settled) onProgress(...args)
    },
    settle: () => {
      settled = true
    },
  }
}
