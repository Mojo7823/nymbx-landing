import { useSyncExternalStore } from 'react'
import { setSetting } from './settings'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'nymbx:theme'

/**
 * Theme is mirrored in localStorage so the inline script in index.html can
 * apply it synchronously before first paint (no flash of wrong theme).
 * The IndexedDB settings store is kept in sync for consistency with other
 * preferences. Light is the default.
 */
export function getTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Browser UI colour (Android address bar, installed-PWA title bar). */
const THEME_COLORS: Record<Theme, string> = { light: '#ffffff', dark: '#1b1b1f' }

/**
 * Tiny external store so every consumer (the header toggle, the Shift+D
 * shortcut, anything else) renders the same theme. `applyTheme` is the only
 * writer and notifies subscribers after the DOM is updated.
 */
const listeners = new Set<() => void>()

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reactive current theme. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getTheme, () => 'light')
}

/** Flips light ↔ dark and returns the theme now in effect. */
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* private mode — theme just won't persist */
  }
  void setSetting('theme', theme).catch(() => {
    /* IndexedDB unavailable — localStorage mirror still works */
  })
  for (const listener of listeners) listener()
}
