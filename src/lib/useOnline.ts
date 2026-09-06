import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

function getSnapshot(): boolean {
  return navigator.onLine
}

/**
 * Live `navigator.onLine`. Note the browser only promises "connected to *a*
 * network", so `true` is not proof a request will succeed — it is used here to
 * explain failures ("this tool hasn't been downloaded yet"), never to gate a
 * client-side feature.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}
