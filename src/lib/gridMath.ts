/**
 * Shared math for virtualized, sortable tables (XLSX/CSV viewer, SBOM viewer).
 * Pure functions only — no DOM, no React.
 */

export interface RowRange {
  start: number
  /** Exclusive. */
  end: number
}

/** Rows to render for the current scroll position, padded by `overscan`. */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  totalRows: number,
  overscan: number,
): RowRange {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const end = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan)
  return { start, end }
}

/**
 * Numeric-aware cell comparison for column sorting: two numeric-looking cells
 * compare as numbers, otherwise text; empty cells always sort last.
 */
export function compareCells(a: string, b: string): number {
  if (a === '' && b === '') return 0
  if (a === '') return 1
  if (b === '') return -1
  const na = Number(a.replace(/,/g, ''))
  const nb = Number(b.replace(/,/g, ''))
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return a.localeCompare(b)
}

export type SortDir = 'asc' | 'desc'
