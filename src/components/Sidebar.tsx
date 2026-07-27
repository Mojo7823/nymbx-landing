import { Link } from 'react-router'
import { X } from 'lucide-react'
import { categories, toolsByCategory } from '../tools/registry'
import { cx } from '../lib/cx'

function CategoryList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Tool categories" className="flex flex-col gap-0.5">
      {categories.map((cat) => {
        const Icon = cat.icon
        const count = toolsByCategory(cat.id).length
        return (
          <Link
            key={cat.id}
            to={`/tools#${cat.id}`}
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-mint hover:text-ink"
          >
            <Icon className="size-4 shrink-0 text-faint" />
            <span className="flex-1">{cat.name}</span>
            <span className="text-[11px] text-faint tabular-nums">{count}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* Desktop: static column */}
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto bg-soft px-3 py-6 shadow-[2px_0_12px_rgba(0,0,0,0.08)] lg:block dark:shadow-[2px_0_12px_rgba(0,0,0,0.5)]">
        <CategoryList />
      </aside>

      {/* Mobile: drawer */}
      <div
        className={cx('fixed inset-0 z-50 lg:hidden', !open && 'pointer-events-none')}
        aria-hidden={!open}
      >
        <div
          onClick={onClose}
          className={cx(
            'absolute inset-0 bg-ink/30 transition-opacity',
            open ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Category navigation"
          className={cx(
            'absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-page px-3 py-4 shadow-xl transition-transform',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="mb-4 flex items-center justify-between px-2">
            <span className="font-display text-sm font-semibold text-ink">NYMBX Toolbox</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
          <CategoryList onNavigate={onClose} />
        </div>
      </div>
    </>
  )
}
