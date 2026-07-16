import { Link } from 'react-router'
import type { ToolMeta } from '../tools/registry'
import { PrivacyBadge } from './PrivacyBadge'
import { cx } from '../lib/cx'

export function ToolCard({ tool }: { tool: ToolMeta }) {
  const available = tool.status === 'available'
  const Icon = tool.icon

  return (
    <Link
      to={`/tools/${tool.slug}`}
      aria-label={`${tool.name}${available ? '' : ' (coming soon)'}`}
      className="group flex flex-col gap-3 rounded-lg border border-line bg-card p-4 transition-all hover:-translate-y-px hover:border-pine/50 hover:shadow-sm"
    >
      <div className="flex items-start justify-between">
        <span
          className={cx(
            'inline-flex size-9 items-center justify-center rounded-md transition-colors',
            available
              ? 'bg-mint text-pine'
              : 'border border-line bg-soft text-muted group-hover:text-pine',
          )}
        >
          <Icon className="size-4.5" />
        </span>
        <span
          aria-hidden
          className="font-mono text-[10px] text-faint tabular-nums"
          title={`Phase ${tool.phase}`}
        >
          {String(tool.phase).padStart(2, '0')}
        </span>
      </div>

      <div>
        <h3 className={cx('text-sm font-semibold', available ? 'text-ink' : 'text-muted')}>
          {tool.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{tool.description}</p>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <PrivacyBadge badge={tool.badge} />
        {!available && (
          <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 font-mono text-[10px] tracking-wide text-faint uppercase">
            Coming soon
          </span>
        )}
      </div>
    </Link>
  )
}
