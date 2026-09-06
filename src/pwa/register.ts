/**
 * Service-worker registration. Loaded through a dynamic `import()` from
 * `App.tsx` after the `load` event so `workbox-window` never lands in the
 * entry chunk and no SW work competes with first paint.
 *
 * Prompt mode: a waiting worker does not take over on its own — the user gets
 * a toast with a Reload action, so an in-flight conversion is never cut short
 * by a background update.
 */
import { registerSW } from 'virtual:pwa-register'
import { toast } from '../lib/toast'

/** How often an open tab re-checks for a new deployment. */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000

export function registerPwa(): void {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast('A new version is ready.', {
        duration: 0,
        action: { label: 'Reload', onClick: () => void updateSW(true) },
      })
    },
    onOfflineReady() {
      toast('NYMBX Toolbox is ready to work offline.', { variant: 'success' })
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => void registration.update().catch(() => undefined)
      setInterval(check, UPDATE_INTERVAL_MS)
      // A tab left open for days only notices a deploy when it is looked at.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
    onRegisterError(error) {
      console.error('Service worker registration failed', error)
    },
  })
}
