import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, CloudDownload, HardDriveDownload, X } from 'lucide-react'
import { Button } from '../components/Button'
import { ProgressBar } from '../components/ProgressBar'
import { formatBytes, transferLabel } from '../lib/format'
import { PrefetchCancelled, PrefetchError, prefetchUrls } from '../lib/prefetch'
import { toast } from '../lib/toast'
import {
  cachedUrlSet,
  computeStatus,
  readOfflineManifest,
  waitForController,
} from './offlineStatus'
import type { OfflineStatus } from './offlineStatus'

/**
 * Dashboard footer: how much of the toolbox is already available offline, and
 * an opt-in way to fetch the rest. Everything is derived from Cache Storage on
 * mount — nothing about it is persisted.
 *
 * Hidden unless a service worker is actually registered, so it never shows in
 * `vite dev` (where there is no SW and the numbers would be meaningless).
 */
export function OfflinePanel() {
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState<OfflineStatus | null>(null)
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [manifest, cached] = await Promise.all([readOfflineManifest(signal), cachedUrlSet()])
    setStatus(computeStatus(manifest, cached))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      if (!('serviceWorker' in navigator)) return
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration || controller.signal.aborted) return
      setReady(true)
      try {
        await refresh(controller.signal)
      } catch {
        // No manifest (or offline with nothing cached) — the panel simply
        // shows nothing rather than an error the user cannot act on.
      }
    })()
    return () => {
      controller.abort()
      abortRef.current?.abort()
    }
  }, [refresh])

  const download = useCallback(async () => {
    if (!status) return
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    setProgress({ loaded: 0, total: 0 })
    try {
      // Without a controlling worker the fetches bypass the SW and nothing is
      // cached; a fresh first visit needs a moment for the handover.
      await waitForController()
      await prefetchUrls(status.missing, setProgress, controller.signal)
      await refresh()
      toast('All tools are available offline.', { variant: 'success' })
    } catch (cause) {
      if (cause instanceof PrefetchCancelled) {
        await refresh().catch(() => undefined)
      } else if (cause instanceof PrefetchError) {
        setError(cause.message)
      } else {
        setError('Download failed. Check your connection and try again.')
      }
    } finally {
      abortRef.current = null
      setProgress(null)
    }
  }, [refresh, status])

  if (!ready || !status) return null

  const complete = status.missing.length === 0
  const remainingBytes = status.totalBytes - status.cachedBytes

  return (
    <section
      aria-label="Offline availability"
      className="mt-12 rounded-lg border border-line bg-card p-5"
    >
      <header className="flex items-center gap-2">
        <HardDriveDownload aria-hidden className="size-4 text-pine" />
        <h2 className="font-display text-base font-semibold text-ink">Use NYMBX offline</h2>
      </header>

      <p className="mt-2 max-w-2xl text-xs text-muted">
        Tools you open are kept for offline use automatically. The background-removal model and the
        OCR language packs are downloaded the first time you use those tools and kept too.
      </p>

      <p className="mt-3 flex items-center gap-1.5 text-sm text-ink" aria-live="polite">
        {complete ? (
          <>
            <CheckCircle2 aria-hidden className="size-4 text-pine" />
            All tools are available offline.
          </>
        ) : (
          <span className="tabular-nums">
            {status.cachedCount} of {status.totalCount} tool files cached (
            {formatBytes(status.cachedBytes)} of {formatBytes(status.totalBytes)})
          </span>
        )}
      </p>

      {progress ? (
        <div className="mt-4 flex items-center gap-3">
          <ProgressBar
            className="flex-1"
            label={transferLabel(progress.loaded, progress.total)}
            value={progress.total > 0 ? (progress.loaded / progress.total) * 100 : undefined}
          />
          <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
            <X className="size-3.5" />
            Cancel
          </Button>
        </div>
      ) : (
        !complete && (
          <Button className="mt-4" size="sm" onClick={() => void download()}>
            <CloudDownload className="size-3.5" />
            Download all tools for offline use ({formatBytes(remainingBytes)})
          </Button>
        )
      )}

      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
