import { Link } from 'react-router'
import { Keyboard, Menu, WifiOff } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { useOnline } from '../lib/useOnline'

export function Header({
  onOpenNav,
  onOpenShortcuts,
}: {
  onOpenNav: () => void
  /** Opens the keyboard-shortcuts dialog (same as pressing `?`). */
  onOpenShortcuts?: () => void
}) {
  const online = useOnline()

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page/95 backdrop-blur-md">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-md focus:bg-card focus:p-3"
      >
        Skip to content
      </a>
      <div className="flex h-14 w-full items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open category navigation"
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-line bg-card text-muted hover:text-ink lg:hidden"
        >
          <Menu className="size-4" />
        </button>

        <Link to="/tools" className="flex min-w-0 items-center gap-2 sm:gap-3">
          <img src="/nymbx-icon.svg" alt="" className="h-9 w-auto" />
          <span className="font-display text-lg font-semibold tracking-tight text-ink">
            NYMBX <span className="hidden font-normal text-muted min-[400px]:inline">Toolbox</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {!online && (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-2.5 py-1 text-[11px] font-medium text-amber-badge"
            >
              <WifiOff className="size-3" />
              Offline
            </span>
          )}
          {onOpenShortcuts && (
            <button
              type="button"
              onClick={onOpenShortcuts}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
              className="hidden size-9 cursor-pointer items-center justify-center rounded-md border border-line bg-card text-muted transition-colors hover:text-ink sm:inline-flex"
            >
              <Keyboard className="size-4" />
            </button>
          )}
          <Link
            to="/contact"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-pine"
          >
            Contact
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
