import { useEffect } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'

export function NotFound() {
  useEffect(() => {
    document.title = 'Page not found — NYMBX Toolbox'
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-mono text-xs tracking-widest text-faint">ERROR 404</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        This page doesn’t exist.
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted">
        Whatever you were looking for, it never left your device either. Head back to the toolbox
        and pick a tool from the catalog.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex h-10 items-center gap-2 rounded-md bg-pine px-4 text-sm font-medium text-page transition-colors hover:bg-pine-deep"
      >
        <ArrowLeft className="size-4" /> Back to the dashboard
      </Link>
    </div>
  )
}
