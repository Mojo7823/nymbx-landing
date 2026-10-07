import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

export interface ToolLayoutProps {
  children: ReactNode
  /** Fill the available viewport; editors scroll inside their panes. */
  workspace?: boolean
}

/** Tool content only; identity and navigation live in the shared top bar. */
export function ToolLayout({ children, workspace = false }: ToolLayoutProps) {
  return (
    <article
      aria-labelledby="active-tool-title"
      data-tool-workspace={workspace || undefined}
      className={cx(
        'flex w-full min-w-0 flex-col p-3 sm:p-4',
        workspace ? 'h-full min-h-0 overflow-auto' : 'min-h-full',
      )}
    >
      {children}
    </article>
  )
}
