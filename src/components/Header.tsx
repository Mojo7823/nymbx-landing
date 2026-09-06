import { Link } from 'react-router'
import { ArrowLeft, Menu, WifiOff } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { useOnline } from '../lib/useOnline'

export function Header({ onOpenNav }: { onOpenNav: () => void }) {
  const online = useOnline()

  return (
    <header className="sticky top-0 z-40 bg-page/60 shadow-[0_1px_12px_rgba(0,0,0,0.08)] backdrop-blur-md dark:shadow-[0_1px_12px_rgba(0,0,0,0.5)]">
      <div className="flex h-14 w-full items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open category navigation"
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-line bg-card text-muted hover:text-ink lg:hidden"
        >
          <Menu className="size-4" />
        </button>

        <Link to="/tools" className="flex items-center gap-3">
          <img src="/nymbx-icon.svg" alt="" className="h-9 w-auto" />
          <span className="font-display text-lg font-semibold tracking-tight text-ink">
            NYMBX <span className="font-normal text-muted">Toolbox</span>
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
          <Link
            to="/"
            className="hidden items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-pine sm:inline-flex"
          >
            <ArrowLeft className="size-3.5" />
            Portfolio
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
