export interface ParsedRanges {
  /** Sorted, deduplicated 1-based page numbers. Empty when input is blank or invalid. */
  pages: number[]
  error?: string
}

/**
 * Parse a page-range expression like `1-3,7,9-` against a document of
 * `pageCount` pages. Supported tokens: `N`, `N-M`, `-M` (from page 1),
 * `N-` (to the last page). Whitespace is tolerated; overlaps are merged.
 * Any page outside 1..pageCount is an error — never silently clamped.
 */
export function parsePageRanges(input: string, pageCount: number): ParsedRanges {
  const tokens = input
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '')

  const selected = new Set<number>()

  for (const token of tokens) {
    const match = /^(\d*)\s*(-?)\s*(\d*)$/.exec(token.replaceAll(/\s+/g, ''))
    if (!match) return invalid(token)
    const [, startStr, dash, endStr] = match

    let start: number
    let end: number
    if (dash === '') {
      if (startStr === '' || endStr !== '') return invalid(token)
      start = end = Number(startStr)
    } else {
      if (startStr === '' && endStr === '') return invalid(token)
      start = startStr === '' ? 1 : Number(startStr)
      end = endStr === '' ? pageCount : Number(endStr)
    }

    if (start < 1 || end < 1) return invalid(token)
    if (start > end) return invalid(token)
    if (start > pageCount || end > pageCount) {
      return {
        pages: [],
        error: `Page ${Math.max(start, end)} in “${token}” is out of range (1-${pageCount})`,
      }
    }
    for (let p = start; p <= end; p++) selected.add(p)
  }

  return { pages: [...selected].sort((a, b) => a - b) }

  function invalid(token: string): ParsedRanges {
    return { pages: [], error: `“${token}” is not a valid page or range` }
  }
}

/** Compress page numbers into the shortest range expression, e.g. `1-3,7,9-11`. */
export function formatPageRanges(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const parts: string[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++
    parts.push(i === j ? String(sorted[i]) : `${sorted[i]}-${sorted[j]}`)
    i = j + 1
  }
  return parts.join(',')
}
