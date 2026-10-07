import { Link } from 'react-router'
import {
  Keyboard,
  Maximize,
  Menu,
  Minimize,
  PanelLeftClose,
  PanelLeftOpen,
  WifiOff,
} from 'lucide-react'
import type { ToolMeta } from '../tools/registry'
import { ThemeToggle } from './ThemeToggle'
import { PrivacyBadge } from './PrivacyBadge'
import { useOnline } from '../lib/useOnline'

export function Header({
  onOpenNav,
  onOpenShortcuts,
  sidebarCollapsed,
  onToggleSidebar,
  activeTool,
  focused,
  onToggleFocus,
}: {
  onOpenNav: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  activeTool?: ToolMeta
  focused: boolean
  onToggleFocus: () => void
  /** Opens the keyboard-shortcuts dialog (same as pressing `?`). */
  onOpenShortcuts?: () => void
}) {
  const online = useOnline()
  const sidebarLabel = sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <header className="z-40 shrink-0 border-b border-line bg-page/95 backdrop-blur-md">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-md focus:bg-card focus:p-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-14 w-full items-center gap-1.5 px-3 py-2 sm:gap-3 sm:px-4">
        {!focused && (
          <>
            <button
              type="button"
              onClick={onOpenNav}
              aria-label="Open category navigation"
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line bg-card text-muted hover:text-ink lg:hidden"
            >
              <Menu className="size-4" />
            </button>
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label={sidebarLabel}
              title={sidebarLabel}
              aria-expanded={!sidebarCollapsed}
              aria-controls="desktop-sidebar"
              className="hidden size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line bg-card text-muted transition-colors hover:text-ink lg:inline-flex"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen aria-hidden="true" className="size-4" />
              ) : (
                <PanelLeftClose aria-hidden="true" className="size-4" />
              )}
            </button>
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
          <Link to="/tools" className="inline-flex shrink-0 items-center gap-2">
            <img src="/nymbx-icon.svg" alt="" className="hidden size-8 sm:block" />
            <span className="font-display text-sm font-semibold tracking-tight text-ink sm:text-lg">
              NYMBX <span className="font-normal text-muted">Toolbox</span>
            </span>
          </Link>
          {activeTool && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span aria-hidden="true" className="text-xs text-faint sm:text-sm">
                ×
              </span>
              <h1
                id="active-tool-title"
                data-tool-title
                className="min-w-0 truncate text-xs font-medium text-ink capitalize sm:text-sm"
              >
                {activeTool.name}
              </h1>
              {activeTool.badge === 'server-assisted' && <PrivacyBadge badge="server-assisted" />}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {!online && (
            <span
              role="status"
              title="Offline"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-soft px-1.5 py-1 text-[11px] font-medium text-amber-badge sm:px-2.5"
            >
              <WifiOff className="size-3" />
              <span className="sr-only sm:not-sr-only">Offline</span>
            </span>
          )}
          {activeTool && (
            <button
              type="button"
              onClick={onToggleFocus}
              aria-pressed={focused}
              title={focused ? 'Exit focus (Esc)' : 'Focus workspace'}
              className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${focused ? 'border-pine bg-mint text-pine' : 'border-line bg-card text-muted hover:text-ink'}`}
            >
              {focused ? (
                <Minimize aria-hidden="true" className="size-3.5" />
              ) : (
                <Maximize aria-hidden="true" className="size-3.5" />
              )}
              Focus
            </button>
          )}
          {!focused && onOpenShortcuts && (
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
          {!activeTool && (
            <Link
              to="/contact"
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-pine"
            >
              Contact
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
