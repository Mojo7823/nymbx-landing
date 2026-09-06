import { useEffect } from 'react'
import { toggleTheme } from './theme'

/** Global (non-dashboard-local) actions the keyboard can trigger. */
export type ShortcutAction = 'focus-search' | 'open-help' | 'toggle-theme'

export interface ShortcutSpec {
  /** Rendered in the help dialog, one <kbd> per entry. */
  keys: string[]
  description: string
}

/** Source of truth for the help dialog; `mac` swaps Ctrl for ⌘. */
export function shortcutList(mac: boolean): ShortcutSpec[] {
  return [
    { keys: [mac ? '⌘' : 'Ctrl', 'K'], description: 'Focus the tool search' },
    { keys: ['/'], description: 'Focus the tool search' },
    { keys: ['?'], description: 'Show these keyboard shortcuts' },
    { keys: ['Shift', 'D'], description: 'Toggle dark mode' },
    { keys: ['Esc'], description: 'Clear the search, or close this dialog' },
    { keys: ['↑', '↓'], description: 'Move through search results' },
    { keys: ['Enter'], description: 'Open the highlighted tool' },
  ]
}

/** True on macOS / iPadOS, where the search shortcut is ⌘K rather than Ctrl+K. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
}

/**
 * Typing into a field must never trigger a global shortcut. Covers native
 * inputs and anything contenteditable (the CodeMirror editors in the markdown
 * tools live inside a `contenteditable` div).
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable || target.closest('[contenteditable]') !== null
}

/**
 * Maps a keydown to a global action, or null when nothing should happen.
 * Returns null for every event that carries a modifier we do not claim, so
 * browser and tool shortcuts keep working.
 */
export function matchShortcut(event: KeyboardEvent): ShortcutAction | null {
  if (event.altKey) return null
  const cmdOrCtrl = event.metaKey || event.ctrlKey

  if (cmdOrCtrl) {
    // Ctrl/⌘+K only; every other combination belongs to the browser or a tool.
    return event.key.toLowerCase() === 'k' && !event.shiftKey ? 'focus-search' : null
  }
  if (event.key === '/') return 'focus-search'
  if (event.key === '?') return 'open-help'
  if (event.shiftKey && event.key === 'D') return 'toggle-theme'
  return null
}

/**
 * Site-wide shortcuts, mounted once in the toolbox Shell. Ignored while the
 * user is typing or while a modal `<dialog>` is open (the dialog handles its
 * own Esc natively).
 */
export function useGlobalShortcuts(handlers: {
  onFocusSearch: () => void
  onOpenHelp: () => void
}): void {
  const { onFocusSearch, onOpenHelp } = handlers

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // A tool that claims the combination first wins — CodeMirror's Mod-K
      // (insert link) in the markdown editors calls preventDefault during
      // bubbling, before this window-level listener runs.
      if (event.defaultPrevented) return
      if (document.querySelector('dialog[open]')) return

      const action = matchShortcut(event)
      if (!action) return
      // Bare keys (`/`, `?`, Shift+D) must stay typeable; the Ctrl/⌘+K chord
      // is not a character, so it keeps working from inside a field.
      if (isEditableTarget(event.target) && !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      if (action === 'focus-search') onFocusSearch()
      else if (action === 'open-help') onOpenHelp()
      else toggleTheme()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onFocusSearch, onOpenHelp])
}
