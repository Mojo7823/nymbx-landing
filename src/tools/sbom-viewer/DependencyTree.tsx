import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '../../components/Button'
import { cx } from '../../lib/cx'
import type { DependencyTree as Tree, TreeNode } from './model'

/** Above this many nodes, "Expand all" would render an unusable wall of rows. */
const EXPAND_ALL_LIMIT = 2000
/** Roots rendered at once; more are revealed on demand so a 10k-root synthetic tree cannot stall the tab. */
const ROOT_PAGE = 200

function nodeKeys(nodes: TreeNode[], prefix: string, into: string[]): void {
  nodes.forEach((node, i) => {
    const key = `${prefix}/${i}:${node.ref}`
    if (node.children.length > 0) {
      into.push(key)
      nodeKeys(node.children, key, into)
    }
  })
}

function NodeRow({
  node,
  nodeKey,
  depth,
  expanded,
  toggle,
}: {
  node: TreeNode
  nodeKey: string
  depth: number
  expanded: Set<string>
  toggle: (key: string) => void
}) {
  const open = expanded.has(nodeKey)
  const hasChildren = node.children.length > 0
  return (
    <li>
      <div className="flex items-center gap-1.5 py-0.5 text-xs" style={{ paddingLeft: depth * 16 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => toggle(nodeKey)}
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${node.label}`}
            className="cursor-pointer rounded p-0.5 text-muted hover:bg-soft hover:text-ink"
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="inline-block size-[1.125rem]" aria-hidden="true" />
        )}
        <span
          className={cx('truncate font-mono', node.unknown ? 'text-amber-badge' : 'text-ink')}
          title={node.ref}
        >
          {node.label}
        </span>
        {node.childCount > 0 && (
          <span className="shrink-0 font-mono text-[10px] text-faint tabular-nums">
            {node.childCount}
          </span>
        )}
        {node.repeated && <span className="shrink-0 text-[10px] text-faint">(shown above)</span>}
        {node.unknown && (
          <span className="shrink-0 text-[10px] text-amber-badge">(unresolved)</span>
        )}
      </div>
      {open && hasChildren && (
        <ul>
          {node.children.map((child, i) => (
            <NodeRow
              key={`${nodeKey}/${i}:${child.ref}`}
              node={child}
              nodeKey={`${nodeKey}/${i}:${child.ref}`}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export function DependencyTree({ tree }: { tree: Tree }) {
  const rootKeys = useMemo(() => tree.roots.map((root, i) => `/${i}:${root.ref}`), [tree])
  const allKeys = useMemo(() => {
    const keys: string[] = []
    nodeKeys(tree.roots, '', keys)
    return keys
  }, [tree])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(rootKeys))
  const [rootLimit, setRootLimit] = useState(ROOT_PAGE)
  const visibleRoots = tree.roots.length > rootLimit ? tree.roots.slice(0, rootLimit) : tree.roots
  const hiddenRoots = tree.roots.length - visibleRoots.length

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const tooBig = tree.nodeCount > EXPAND_ALL_LIMIT

  if (tree.roots.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-card p-8 text-center text-sm text-muted">
        This document declares no dependency relationships.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setExpanded(new Set(allKeys))}
          disabled={tooBig}
        >
          Expand all
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set())}>
          Collapse all
        </Button>
        <p className="font-mono text-[11px] text-muted tabular-nums">
          {tree.nodeCount.toLocaleString()} nodes · {tree.roots.length.toLocaleString()}{' '}
          {tree.roots.length === 1 ? 'root' : 'roots'}
        </p>
        {tooBig && (
          <p className="text-[11px] text-faint">
            Expand all is disabled above {EXPAND_ALL_LIMIT.toLocaleString()} nodes — expand branches
            individually.
          </p>
        )}
      </div>

      {tree.unresolved.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-amber-badge/40 bg-amber-soft px-3 py-2 text-xs text-amber-badge">
          <AlertTriangle className="mt-px size-3.5 shrink-0" />
          <span>
            {tree.unresolved.length.toLocaleString()} dependency{' '}
            {tree.unresolved.length === 1 ? 'ref points' : 'refs point'} to components this document
            does not describe:{' '}
            <span className="font-mono">{tree.unresolved.slice(0, 5).join(', ')}</span>
            {tree.unresolved.length > 5 && ` … and ${tree.unresolved.length - 5} more`}
          </span>
        </p>
      )}

      <div className="max-h-[60vh] overflow-auto rounded-lg border border-line bg-card p-3">
        <ul>
          {visibleRoots.map((root, i) => (
            <NodeRow
              key={rootKeys[i]}
              node={root}
              nodeKey={rootKeys[i]}
              depth={0}
              expanded={expanded}
              toggle={toggle}
            />
          ))}
        </ul>
        {hiddenRoots > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => setRootLimit((n) => n + ROOT_PAGE)}
          >
            Show {Math.min(ROOT_PAGE, hiddenRoots).toLocaleString()} more roots (
            {hiddenRoots.toLocaleString()} hidden)
          </Button>
        )}
      </div>
    </div>
  )
}
