import { formatBytes } from '../../lib/format'

export interface DomCounts {
  tables: number
  images: number
  links: number
}

/** Count the structures worth reporting, on the sanitized DOM. */
export function countDomStats(root: ParentNode): DomCounts {
  return {
    tables: root.querySelectorAll('table').length,
    images: root.querySelectorAll('img').length,
    links: root.querySelectorAll('a[href]').length,
  }
}

/** UTF-8 byte length — what the user would see on disk, not the code-unit count. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

function plural(n: number, noun: string): string {
  return `${n.toLocaleString()} ${noun}${n === 1 ? '' : 's'}`
}

/** `12.4 KB HTML → 3.1 KB Markdown · 3 tables · 2 images · 14 links` */
export function formatStatsLine(
  htmlBytes: number,
  markdownBytes: number,
  counts: DomCounts,
): string {
  const parts = [`${formatBytes(htmlBytes)} HTML → ${formatBytes(markdownBytes)} Markdown`]
  if (counts.tables > 0) parts.push(plural(counts.tables, 'table'))
  if (counts.images > 0) parts.push(plural(counts.images, 'image'))
  if (counts.links > 0) parts.push(plural(counts.links, 'link'))
  return parts.join(' · ')
}
