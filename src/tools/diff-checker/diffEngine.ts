import { createTwoFilesPatch, diffArrays, diffLines } from 'diff'

export type Granularity = 'chars' | 'words' | 'lines'

export interface DiffPart {
  added: boolean
  removed: boolean
  value: string
}

export interface DiffSummary {
  parts: DiffPart[]
  /** Added/removed unit counts at the requested granularity. */
  added: number
  removed: number
  identical: boolean
  /** True when the diff was abandoned because the inputs are too divergent. */
  timedOut: boolean
  granularity: Granularity
}

/** Abandon pathological token diffs after this long (worker-side). */
const DIFF_TIMEOUT_MS = 5000

const isWhitespace = (s: string) => /^\s+$/.test(s)

/**
 * Split into grapheme clusters or word segments. Intl.Segmenter keeps
 * surrogate pairs, emoji ZWJ sequences and CJK text intact — jsdiff's own
 * char/word tokenizers operate on code units and can split them.
 */
function segment(text: string, granularity: 'grapheme' | 'word'): string[] {
  if (text === '') return []
  const segmenter = new Intl.Segmenter(undefined, { granularity })
  return Array.from(segmenter.segment(text), (s) => s.segment)
}

function countLines(value: string): number {
  return value === '' ? 0 : value.replace(/\n$/, '').split('\n').length
}

const empty = (granularity: Granularity): DiffSummary => ({
  parts: [],
  added: 0,
  removed: 0,
  identical: true,
  timedOut: false,
  granularity,
})

export function computeDiff(
  a: string,
  b: string,
  granularity: Granularity,
  ignoreWhitespace: boolean,
): DiffSummary {
  if (a === '' && b === '') return empty(granularity)

  if (granularity === 'lines') {
    const changes = diffLines(a, b, { ignoreWhitespace })
    const parts: DiffPart[] = changes.map((c) => ({
      added: c.added,
      removed: c.removed,
      value: c.value,
    }))
    return {
      parts,
      added: parts.filter((p) => p.added).reduce((n, p) => n + countLines(p.value), 0),
      removed: parts.filter((p) => p.removed).reduce((n, p) => n + countLines(p.value), 0),
      identical: parts.every((p) => !p.added && !p.removed),
      timedOut: false,
      granularity,
    }
  }

  const tokensA = segment(a, granularity === 'chars' ? 'grapheme' : 'word')
  const tokensB = segment(b, granularity === 'chars' ? 'grapheme' : 'word')
  const changes = diffArrays(tokensA, tokensB, {
    timeout: DIFF_TIMEOUT_MS,
    ...(ignoreWhitespace && {
      comparator: (x: string, y: string) => x === y || (isWhitespace(x) && isWhitespace(y)),
    }),
  })
  if (!changes) return { ...empty(granularity), identical: false, timedOut: true }

  const parts: DiffPart[] = changes.map((c) => ({
    added: c.added,
    removed: c.removed,
    value: c.value.join(''),
  }))
  const countTokens = (flag: 'added' | 'removed') =>
    changes
      .filter((c) => (flag === 'added' ? c.added : c.removed))
      .reduce((n, c) => n + c.value.filter((t) => !isWhitespace(t)).length, 0)
  return {
    parts,
    added: countTokens('added'),
    removed: countTokens('removed'),
    identical: parts.every((p) => !p.added && !p.removed),
    timedOut: false,
    granularity,
  }
}

/** Standard unified diff (patch) between the two texts. */
export function unifiedDiff(a: string, b: string, ignoreWhitespace: boolean): string {
  return createTwoFilesPatch('original', 'changed', a, b, undefined, undefined, {
    context: 3,
    ignoreWhitespace,
  })
}
