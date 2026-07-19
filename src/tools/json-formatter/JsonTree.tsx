import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

/** Children rendered per container — keeps huge arrays from flooding the DOM. */
const CHILD_CAP = 500

function primitiveLabel(value: string | number | boolean | null): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

function summary(value: JsonValue[] | { [k: string]: JsonValue }): string {
  if (Array.isArray(value)) {
    return `[…] ${value.length} ${value.length === 1 ? 'item' : 'items'}`
  }
  const n = Object.keys(value).length
  return `{…} ${n} ${n === 1 ? 'key' : 'keys'}`
}

function TreeNode({
  name,
  value,
  depth,
}: {
  name: string | null
  value: JsonValue
  depth: number
}) {
  const [open, setOpen] = useState(depth === 0)
  const container = value !== null && typeof value === 'object'

  const label = name !== null && (
    <span className="font-semibold text-pine">{JSON.stringify(name)}: </span>
  )

  if (!container) {
    return (
      <div style={{ paddingLeft: depth * 16 + 20 }} className="leading-6">
        {label}
        <span
          className={
            typeof value === 'string'
              ? 'text-ink'
              : value === null || typeof value === 'boolean'
                ? 'text-muted italic'
                : 'text-ink'
          }
        >
          {primitiveLabel(value)}
        </span>
      </div>
    )
  }

  const entries: [string | null, JsonValue][] = Array.isArray(value)
    ? value.map((v) => [null, v] as [null, JsonValue])
    : Object.entries(value)
  const shown = entries.slice(0, CHILD_CAP)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ paddingLeft: depth * 16 }}
        className="inline-flex w-full cursor-pointer items-center gap-0.5 text-left leading-6 hover:bg-mint/40"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-faint" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-faint" aria-hidden />
        )}
        <span className="min-w-0 truncate">
          {label}
          <span className="text-muted">{summary(value)}</span>
        </span>
      </button>
      {open && (
        <div>
          {shown.map(([k, v], idx) => (
            <TreeNode key={k ?? idx} name={k} value={v} depth={depth + 1} />
          ))}
          {entries.length > CHILD_CAP && (
            <p style={{ paddingLeft: (depth + 1) * 16 + 20 }} className="leading-6 text-faint">
              … {(entries.length - CHILD_CAP).toLocaleString()} more not shown
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function JsonTree({ value }: { value: JsonValue }) {
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-line bg-card p-3 font-mono text-xs tabular-nums">
      <TreeNode name={null} value={value} depth={0} />
    </div>
  )
}
