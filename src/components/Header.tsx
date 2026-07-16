import { Link } from 'react-router'
import { Menu } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

export function Header({ onOpenNav }: { onOpenNav: () => void }) {
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

        <Link to="/" className="flex items-center gap-2.5">
          <img src="/nymbx-icon.svg" alt="" className="size-7" />
          <span className="font-display text-base font-semibold tracking-tight text-ink">
            NYMBX <span className="font-normal text-muted">Toolbox</span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
