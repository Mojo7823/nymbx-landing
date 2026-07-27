import { useEffect } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Wrench } from 'lucide-react'

export function NotFound() {
  useEffect(() => {
    document.title = 'Page not found · NYMBX'
  }, [])

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-7xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-xs font-semibold tracking-[0.2em] text-faint uppercase">ERROR 404</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        This page doesn’t exist.
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted">
        Whatever you were looking for, it never left your device either. Head back home, or pick a
        tool from the toolbox catalog.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-deep dark:text-brand-ink"
        >
          <ArrowLeft className="size-4" /> Back home
        </Link>
        <Link
          to="/tools"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand"
        >
          <Wrench className="size-4" /> Browse the toolbox
        </Link>
      </div>
    </div>
  )
}
