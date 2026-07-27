import { Construction, FileInput, FileOutput, SlidersHorizontal } from 'lucide-react'
import type { ToolMeta } from '../tools/registry'
import { ToolLayout } from '../components/ToolLayout'
import { Button } from '../components/Button'

function PlaceholderBox({
  icon: Icon,
  label,
  hint,
}: {
  icon: typeof FileInput
  label: string
  hint: string
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line px-6 py-8 text-center">
      <Icon className="size-6 text-faint" />
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="text-xs text-faint">{hint}</p>
    </div>
  )
}

/**
 * Stand-in page rendered for every tool that hasn't shipped yet.
 * It sketches the standard tool anatomy (input → options → output) so the
 * page structure exists before the phase that implements it.
 */
export function ToolPlaceholder({ tool }: { tool: ToolMeta }) {
  return (
    <ToolLayout title={tool.name} description={tool.description} badge={tool.badge}>
      <div
        role="note"
        className="mb-6 flex items-start gap-3 rounded-lg border border-line bg-mint/60 p-4"
      >
        <Construction className="mt-0.5 size-4 shrink-0 text-pine" />
        <div className="text-sm">
          <p className="font-medium text-ink">Coming soon</p>
          <p className="mt-0.5 text-muted">
            This tool is planned as phase{' '}
            <span className="text-xs font-semibold tabular-nums">
              {String(tool.phase).padStart(2, '0')}
            </span>{' '}
            of the roadmap. The layout below is a placeholder for the working tool.
          </p>
        </div>
      </div>

      <div className="space-y-4" aria-hidden>
        <PlaceholderBox
          icon={FileInput}
          label="Input"
          hint="File drop or text entry will live here"
        />

        <div className="rounded-lg border border-line bg-card p-4">
          <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted">
            <SlidersHorizontal className="size-3.5 text-faint" /> Options
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="h-8 w-28 rounded-md border border-line bg-soft" />
            <span className="h-8 w-36 rounded-md border border-line bg-soft" />
            <span className="h-8 w-24 rounded-md border border-line bg-soft" />
          </div>
        </div>

        <PlaceholderBox
          icon={FileOutput}
          label="Output"
          hint="Results and preview will render here"
        />

        <div className="flex gap-2">
          <Button disabled>Run</Button>
          <Button disabled variant="secondary">
            Download
          </Button>
        </div>
      </div>
    </ToolLayout>
  )
}
