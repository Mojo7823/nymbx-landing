import { compareCells, type SortDir } from '../../lib/gridMath'

// Generic grid math lives in src/lib/gridMath.ts (shared with the SBOM
// viewer); re-exported here so this module stays the viewer's single import.
export { compareCells, visibleRange } from '../../lib/gridMath'
export type { RowRange, SortDir } from '../../lib/gridMath'

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
