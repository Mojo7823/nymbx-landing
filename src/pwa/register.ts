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
import { getToasts, toast } from '../lib/toast'

/** How often an open tab re-checks for a new deployment. */
const UPDATE_INTERVAL_MS = 60 * 60 * 1000

export function registerPwa(): void {
  let refreshToast: number | undefined
  let reloading = false
  const reloadPage = () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  }
  const updateSW = registerSW({
    immediate: true,
    onNeedReload: reloadPage,
    onNeedRefresh() {
      // Workbox can report the same waiting worker again after an update check.
      if (getToasts().some(({ id }) => id === refreshToast)) return
      refreshToast = toast('A new version is ready.', {
        duration: 0,
        action: {
          label: 'Reload',
          onClick: async () => {
            const registration = await navigator.serviceWorker.getRegistration()
            if (!registration?.waiting) {
              reloadPage()
              return
            }
            // Workbox's isUpdate flag stays false in a first-visit tab. Observe
            // the real controller change so its consented update also reloads.
            navigator.serviceWorker.addEventListener('controllerchange', reloadPage, { once: true })
            await updateSW(true)
          },
        },
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
