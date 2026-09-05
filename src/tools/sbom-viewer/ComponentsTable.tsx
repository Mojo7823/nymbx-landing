import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import { visibleRange } from '../../lib/gridMath'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import {
  componentLabel,
  componentsToCsv,
  filterSort,
  type SbomComponent,
  type SortColumn,
} from './model'

const ROW_H = 36
const OVERSCAN = 8

interface Column {
  key: SortColumn
  label: string
  width: number
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Name', width: 260 },
  { key: 'version', label: 'Version', width: 120 },
  { key: 'type', label: 'Type', width: 120 },
  { key: 'supplier', label: 'Supplier', width: 170 },
  { key: 'licenses', label: 'Licenses', width: 190 },
  { key: 'purl', label: 'PURL', width: 340 },
]

const TABLE_WIDTH = COLUMNS.reduce((sum, column) => sum + column.width, 0)

function cellValue(component: SbomComponent, key: SortColumn): string {
  switch (key) {
    case 'name':
      return component.group ? `${component.group}/${component.name}` : component.name
    case 'licenses':
      return component.licenses.join(', ')
    default:
      return component[key]
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="overflow-wrap-anywhere font-mono text-xs text-ink">{value}</dd>
    </div>
  )
}

export function ComponentsTable({
  components,
  stem,
}: {
  components: SbomComponent[]
  stem: string
}) {
  const [query, setQuery] = useState('')
  const [sortCol, setSortCol] = useState<SortColumn | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  // Selection is the component itself, so filtering or sorting never points
  // the details panel at a different row.
  const [selected, setSelected] = useState<SbomComponent | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(480)
  const scrollRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebouncedValue(query, 200)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setViewportH(el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const rows = useMemo(
    () => filterSort(components, debouncedQuery, sortCol, sortDir),
    [components, debouncedQuery, sortCol, sortDir],
  )

  function onHeaderClick(key: SortColumn) {
    if (sortCol !== key) {
      setSortCol(key)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortCol(null)
    }
  }

  function exportCsv() {
    const csv = componentsToCsv(rows)
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${stem}.components.csv`)
  }

  const range = visibleRange(scrollTop, viewportH, ROW_H, rows.length, OVERSCAN)
  const detail = selected
  const cellBase = 'shrink-0 truncate border-b border-line px-3 leading-9 text-xs'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, version, purl, license…"
          aria-label="Search components"
          className="h-8 w-64 rounded-md border border-line-strong bg-card px-2 text-xs text-ink placeholder:text-faint focus:border-pine focus:outline-none"
        />
        <p role="status" className="font-mono text-[11px] text-muted tabular-nums">
          {debouncedQuery
            ? `${rows.length.toLocaleString()} of ${components.length.toLocaleString()} components match`
            : `${components.length.toLocaleString()} components`}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
          <CopyButton
            label="Copy PURLs"
            text={() =>
              rows
                .map((component) => component.purl)
                .filter(Boolean)
                .join('\n')
            }
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-line bg-card p-8 text-center text-sm text-muted">
          {components.length === 0
            ? 'This document lists no components.'
            : 'No components match the search.'}
        </p>
      ) : (
        <div
          ref={scrollRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          className="relative overflow-auto rounded-lg border border-line bg-card"
          style={{ height: `min(60vh, ${ROW_H * (rows.length + 1) + 2}px)` }}
        >
          <div style={{ width: TABLE_WIDTH, height: ROW_H * (rows.length + 1) }}>
            <div
              role="row"
              className="sticky top-0 z-10 flex bg-soft"
              style={{ width: TABLE_WIDTH }}
            >
              {COLUMNS.map((column) => (
                <button
                  key={column.key}
                  onClick={() => onHeaderClick(column.key)}
                  aria-label={`Sort by ${column.label}`}
                  className={cx(
                    cellBase,
                    'inline-flex cursor-pointer items-center gap-1 font-semibold',
                    sortCol === column.key ? 'text-pine' : 'text-muted hover:text-ink',
                  )}
                  style={{ width: column.width }}
                >
                  {column.label}
                  {sortCol === column.key &&
                    (sortDir === 'asc' ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    ))}
                </button>
              ))}
            </div>

            <div
              style={{
                position: 'absolute',
                top: ROW_H + range.start * ROW_H,
                left: 0,
                width: TABLE_WIDTH,
              }}
            >
              {rows.slice(range.start, range.end).map((component, i) => {
                const index = range.start + i
                return (
                  <div
                    key={`${component.ref ?? component.name}-${index}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(component === selected ? null : component)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelected(component === selected ? null : component)
                      }
                    }}
                    className={cx(
                      'flex cursor-pointer',
                      component === selected ? 'bg-mint' : 'hover:bg-soft',
                    )}
                    style={{ width: TABLE_WIDTH }}
                  >
                    {COLUMNS.map((column) => (
                      <div
                        key={column.key}
                        className={cx(
                          cellBase,
                          column.key === 'name' ? 'font-medium text-ink' : 'text-muted',
                          column.key === 'purl' && 'font-mono',
                        )}
                        style={{ width: column.width }}
                        title={cellValue(component, column.key)}
                      >
                        {cellValue(component, column.key)}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {detail && (
        <section className="mt-3 rounded-lg border border-line bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-display text-sm font-semibold text-ink">
              {componentLabel(detail)}
            </h3>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close component details"
              className="cursor-pointer rounded p-1 text-muted hover:bg-soft hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
          <dl className="mt-2 divide-y divide-line">
            <DetailRow label="Type" value={detail.type} />
            <DetailRow label="Supplier" value={detail.supplier} />
            <DetailRow label="Licenses" value={detail.licenses.join(', ')} />
            <DetailRow label="PURL" value={detail.purl} />
            <DetailRow label="CPE" value={detail.cpe} />
            <DetailRow label="bom-ref" value={detail.ref ?? ''} />
          </dl>
          {detail.description && (
            <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
              {detail.description}
            </p>
          )}
          {detail.hashes.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">Hashes</h4>
              <ul className="mt-2 space-y-2">
                {detail.hashes.map((hash, i) => (
                  <li key={`${hash.alg}-${i}`} className="flex flex-wrap items-center gap-2">
                    <span className="rounded border border-line bg-soft px-1.5 py-0.5 font-mono text-[11px] text-muted">
                      {hash.alg}
                    </span>
                    <code className="overflow-wrap-anywhere min-w-0 flex-1 font-mono text-[11px] text-ink">
                      {hash.value}
                    </code>
                    <CopyButton text={hash.value} label="Copy" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
