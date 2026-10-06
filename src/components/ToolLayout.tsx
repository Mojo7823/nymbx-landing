import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type { ToolBadge } from '../tools/registry'
import { PrivacyBadge } from './PrivacyBadge'

export interface ToolLayoutProps {
  title: string
  description: string
  badge: ToolBadge
  children: ReactNode
}

/** Standard frame for every tool page: back link, title, privacy badge, body. */
export function ToolLayout({ title, description, badge, children }: ToolLayoutProps) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · NYMBX Toolbox`
    return () => {
      document.title = previous
    }
  }, [title])

  return (
    <article className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Link
        to="/tools"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-pine"
      >
        <ArrowLeft className="size-3.5" />
        All tools
      </Link>
      <header className="mt-4 mb-6 border-b border-line pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1
            data-tool-title
            className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl"
          >
            {title}
          </h1>
          <PrivacyBadge badge={badge} />
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
      </header>
      {children}
    </article>
  )
}
