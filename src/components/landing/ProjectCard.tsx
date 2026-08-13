import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../../lib/cx'
import { ProjectDialog } from './ProjectDialog'
import { STRINGS, type Lang } from './i18n'
import type { Project, ProjectStatus } from './projects'

const statusStyles: Record<ProjectStatus, string> = {
  live: 'border-brand/40 bg-brand-soft text-brand',
  soon: 'border-line-strong bg-soft text-muted',
}

const cardClass =
  'pcard group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-all duration-300 hover:-translate-y-1 hover:border-brand/50 hover:shadow-[0_18px_40px_-24px_var(--c-brand-ink)]'

/**
 * Wraps the card body in whatever its target needs: a route link, an external
 * anchor, a button that opens the summary dialog, or nothing at all.
 */
function CardShell({
  project,
  statusLabel,
  onOpenDetails,
  children,
}: {
  project: Project
  statusLabel: string
  onOpenDetails: () => void
  children: ReactNode
}) {
  if (!project.href) {
    if (project.details) {
      return (
        <button
          type="button"
          onClick={onOpenDetails}
          className={cx(cardClass, 'cursor-pointer text-left')}
          aria-haspopup="dialog"
        >
          {children}
        </button>
      )
    }
    return (
      <div className={cardClass} aria-label={`${project.name} (${statusLabel})`}>
        {children}
      </div>
    )
  }
  if (project.external) {
    return (
      <a href={project.href} target="_blank" rel="noreferrer" className={cardClass}>
        {children}
      </a>
    )
  }
  return (
    <Link to={project.href} className={cardClass}>
      {children}
    </Link>
  )
}

export function ProjectCard({ project, lang }: { project: Project; lang: Lang }) {
  const Art = project.art
  const [detailsOpen, setDetailsOpen] = useState(false)
  const statusLabel = STRINGS[lang].status[project.status]

  return (
    <>
      <CardShell
        project={project}
        statusLabel={statusLabel}
        onOpenDetails={() => setDetailsOpen(true)}
      >
        <div className="pcard__art aspect-16/9 w-full overflow-hidden">
          <Art />
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink transition-colors group-hover:text-brand">
              {project.name}
            </h3>
            <span
              className={cx(
                'shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase',
                statusStyles[project.status],
              )}
            >
              {statusLabel}
            </span>
          </div>

          <p className="text-sm font-medium text-brand-deep dark:text-brand">
            {project.tagline[lang]}
          </p>
          <p className="text-sm leading-relaxed text-muted">{project.description[lang]}</p>

          <ul className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {project.tags[lang].map((tag) => (
              <li
                key={tag}
                className="rounded-md border border-line bg-soft px-2 py-0.5 text-[11px] text-muted"
              >
                {tag}
              </li>
            ))}
          </ul>
        </div>
      </CardShell>
      <ProjectDialog
        project={project}
        lang={lang}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </>
  )
}
