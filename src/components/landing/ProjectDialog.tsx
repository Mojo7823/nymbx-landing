import { useEffect, useRef } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { STRINGS, type Lang } from './i18n'
import type { Project } from './projects'

/**
 * Modal summary for a project that has no public URL of its own. Uses the
 * native <dialog> so Esc, focus trapping and the backdrop come for free.
 */
export function ProjectDialog({
  project,
  lang,
  open,
  onClose,
}: {
  project: Project
  lang: Lang
  open: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const details = project.details?.[lang]

  // Keep the native dialog in sync with React state.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  if (!details) return null

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Clicking the backdrop lands on the dialog element itself.
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-labelledby={`${project.id}-dialog-title`}
      className="m-auto w-[min(46rem,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-0 text-ink backdrop:bg-brand-ink/60 backdrop:backdrop-blur-sm"
    >
      <div className="max-h-[80dvh] overflow-y-auto p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-brand uppercase">
              {project.name}
            </p>
            <h2
              id={`${project.id}-dialog-title`}
              className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink"
            >
              {details.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={STRINGS[lang].dialog.close}
            className="-mt-1 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line text-muted transition-colors hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {details.paragraphs.map((text) => (
            <p key={text.slice(0, 32)} className="text-sm leading-relaxed text-muted">
              {text}
            </p>
          ))}
        </div>

        {details.keyDates && (
          <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-soft">
            {details.keyDates.map((d) => (
              <li
                key={d.date}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5"
              >
                <span className="w-28 shrink-0 text-xs font-semibold text-brand tabular-nums">
                  {d.date}
                </span>
                <span className="text-sm text-muted">{d.what}</span>
              </li>
            ))}
          </ul>
        )}

        {details.ctas && (
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {details.ctas.map((cta, index) => (
              <a
                key={cta.href}
                href={cta.href}
                target="_blank"
                rel="noreferrer"
                className={
                  index === 0
                    ? 'inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-medium text-white transition-colors hover:bg-brand-deep dark:text-brand-ink'
                    : 'inline-flex h-11 items-center gap-2 rounded-lg border border-line-strong px-5 text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand'
                }
              >
                {cta.label}
                <ArrowUpRight className="size-4" />
              </a>
            ))}
          </div>
        )}
      </div>
    </dialog>
  )
}
