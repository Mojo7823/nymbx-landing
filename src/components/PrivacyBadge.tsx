import { Globe, Monitor } from 'lucide-react'
import type { ToolBadge } from '../tools/registry'
import { cx } from '../lib/cx'

const labels: Record<ToolBadge, string> = {
  'client-side': 'Client-side',
  'server-assisted': 'Server-assisted',
}

/**
 * Privacy badge shown on tool cards and tool pages. Icon-only:
 * computer (green) = processing stays in the browser;
 * computer + globe (amber) = uses our conversion server.
 */
export function PrivacyBadge({ badge, className }: { badge: ToolBadge; className?: string }) {
  const clientSide = badge === 'client-side'
  return (
    <span
      role="img"
      aria-label={labels[badge]}
      title={labels[badge]}
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-1',
        clientSide ? 'bg-mint text-pine' : 'bg-amber-soft text-amber-badge',
        className,
      )}
    >
      <Monitor aria-hidden className="size-3.5" />
      {!clientSide && <Globe aria-hidden className="size-3.5" />}
    </span>
  )
}
