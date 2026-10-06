import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { X } from 'lucide-react'
import { categories, toolsByCategory } from '../tools/registry'

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
            className="flex items-center gap-2.5 rounded-md px-2 py-2.5 text-sm text-muted transition-colors hover:bg-mint hover:text-ink"
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
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <>
      {/* Desktop: static column */}
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-52 shrink-0 overflow-y-auto border-r border-line bg-soft/40 px-3 py-6 lg:block">
        <CategoryList />
      </aside>

      {/* Native dialog traps focus and supports Escape on mobile. */}
      <dialog
        ref={dialogRef}
        aria-label="Category navigation"
        onClose={onClose}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-ink backdrop:bg-black/40"
      >
        <div className="min-h-full w-72 max-w-[85vw] border-r border-line bg-page px-3 py-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between px-2">
            <span className="font-display text-sm font-semibold text-ink">NYMBX Toolbox</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-md text-muted hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
          <CategoryList onNavigate={onClose} />
          <Link
            to="/contact"
            onClick={onClose}
            className="mt-4 block border-t border-line px-2 py-4 text-sm text-muted hover:text-pine"
          >
            Contact NYMBX
          </Link>
        </div>
      </dialog>
    </>
  )
}
