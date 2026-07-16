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

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* private mode — theme just won't persist */
  }
  void setSetting('theme', theme).catch(() => {
    /* IndexedDB unavailable — localStorage mirror still works */
  })
}
