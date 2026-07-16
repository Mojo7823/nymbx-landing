/** One pdf.js text item, reduced to the geometry the heuristics need. */
export interface MdTextItem {
  str: string
  /** Effective font size in points. */
  fontSize: number
  /** Left edge of the item in PDF user space. */
  x: number
  /** Baseline y in PDF user space (origin bottom-left). */
  y: number
  width: number
  hasEOL: boolean
}

interface Line {
  text: string
  size: number
  y: number
}

/** Ratio above the body font size at which a line qualifies as a heading. */
const HEADING_SIZE_RATIO = 1.15
/** Headings longer than this are almost certainly body text set large. */
const MAX_HEADING_CHARS = 200
/** Vertical gap (in multiples of the line's font size) that splits paragraphs. */
const PARAGRAPH_GAP_RATIO = 1.8
/** Horizontal gap (in multiples of the font size) that implies a missing space. */
const WORD_GAP_RATIO = 0.25

/**
 * Group items into lines following content-stream order: a new line starts
 * on an explicit EOL or when the baseline moves by more than half a line.
 * Keeping stream order (instead of sorting by y) keeps multi-column text
 * in reading order.
 */
function itemsToLines(items: MdTextItem[]): Line[] {
  const lines: Line[] = []
  let current: { parts: string[]; size: number; y: number; endX: number } | null = null

  for (const item of items) {
    if (
      current === null ||
      Math.abs(item.y - current.y) > 0.5 * Math.max(item.fontSize, current.size)
    ) {
      if (current) lines.push(flush(current))
      current = { parts: [item.str], size: item.fontSize, y: item.y, endX: item.x + item.width }
    } else {
      const gap = item.x - current.endX
      const prev = current.parts[current.parts.length - 1] ?? ''
      const needsSpace =
        gap > WORD_GAP_RATIO * item.fontSize && !prev.endsWith(' ') && !item.str.startsWith(' ')
      current.parts.push(needsSpace ? ` ${item.str}` : item.str)
      current.size = Math.max(current.size, item.fontSize)
      current.endX = item.x + item.width
    }
    if (item.hasEOL && current) {
      lines.push(flush(current))
      current = null
    }
  }
  if (current) lines.push(flush(current))
  return lines.filter((l) => l.text.length > 0)

  function flush(c: { parts: string[]; size: number; y: number }): Line {
    return { text: c.parts.join('').replace(/\s+/g, ' ').trim(), size: c.size, y: c.y }
  }
}

/** Dominant font size, weighted by character count so captions don't win. */
function bodySize(lines: Line[]): number {
  const weights = new Map<number, number>()
  for (const line of lines) {
    const size = roundSize(line.size)
    weights.set(size, (weights.get(size) ?? 0) + line.text.length)
  }
  let best = 0
  let bestWeight = -1
  for (const [size, weight] of weights) {
    if (weight > bestWeight) {
      best = size
      bestWeight = weight
    }
  }
  return best
}

function roundSize(size: number): number {
  return Math.round(size * 2) / 2
}

/** A body line must not accidentally parse as markdown structure. */
function escapeBody(text: string): string {
  return text.replace(/^([#>\-+*]|\d+\.)/, '\\$1')
}

/**
 * Convert extracted pdf.js text items (one array per page) into markdown.
 * Headings are inferred from font size: the up-to-three distinct sizes
 * clearly above the dominant body size map to #, ##, ###.
 */
export function pagesToMarkdown(pages: MdTextItem[][]): string {
  const pageLines = pages.map(itemsToLines)
  const allLines = pageLines.flat()
  if (allLines.length === 0) return ''

  const body = bodySize(allLines)
  const headingSizes = [...new Set(allLines.map((l) => roundSize(l.size)))]
    .filter((s) => s > body * HEADING_SIZE_RATIO)
    .sort((a, b) => b - a)
    .slice(0, 3)

  const blocks: string[] = []
  for (const lines of pageLines) {
    let paragraph: string[] = []
    let prev: Line | null = null

    const endParagraph = () => {
      if (paragraph.length > 0) blocks.push(escapeBody(paragraph.join(' ')))
      paragraph = []
    }

    for (const line of lines) {
      const level = headingSizes.indexOf(roundSize(line.size)) + 1
      if (level > 0 && line.text.length <= MAX_HEADING_CHARS) {
        endParagraph()
        blocks.push(`${'#'.repeat(level)} ${line.text}`)
      } else {
        const gap = prev ? prev.y - line.y : 0
        if (paragraph.length > 0 && gap > PARAGRAPH_GAP_RATIO * line.size) endParagraph()
        paragraph.push(line.text)
      }
      prev = line
    }
    endParagraph()
  }
  return blocks.join('\n\n')
}
