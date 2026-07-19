/** Spreadsheet column label: 0 → A, 25 → Z, 26 → AA, 702 → AAA. */
export function colLabel(index: number): string {
  let label = ''
  let n = index
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

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

/** Stable sort of row indices by one column; empty cells stay last either way. */
export function sortIndices(
  rows: string[][],
  indices: number[],
  col: number,
  dir: SortDir,
): number[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...indices].sort((ia, ib) => {
    const a = rows[ia]?.[col] ?? ''
    const b = rows[ib]?.[col] ?? ''
    if (a === '' || b === '') return compareCells(a, b)
    return sign * compareCells(a, b) || ia - ib
  })
}

/** Indices of rows where any cell contains `query` (case-insensitive). */
export function filterIndices(rows: string[][], query: string): number[] {
  const q = query.toLowerCase()
  const out: number[] = []
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((cell) => cell.toLowerCase().includes(q))) out.push(i)
  }
  return out
}

/** Rectangular cell block → tab-separated text (rows by newline). */
export function buildTsv(cells: string[][]): string {
  return cells.map((row) => row.join('\t')).join('\n')
}
