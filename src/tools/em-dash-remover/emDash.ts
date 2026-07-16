export type DashMode = 'hyphen' | 'comma' | 'remove'

export interface EmDashOptions {
  mode: DashMode
  /** Also replace en-dashes (–), not just em-dashes (—). */
  includeEnDash: boolean
}

export interface EmDashResult {
  output: string
  /** Number of dash characters replaced or removed. */
  count: number
}

/** Horizontal whitespace — spaces/tabs but never newlines. */
const HWS = '[^\\S\\r\\n]'

/**
 * Replace em-dashes (and optionally en-dashes) in `input`.
 *
 * - `hyphen`: each dash becomes `-`; surrounding spacing is untouched.
 * - `comma`: a dash run and its surrounding spaces become `, ` between words;
 *   a dash dangling at a line start or end is stripped instead.
 * - `remove`: a dash run is deleted; if it separated words with spacing,
 *   a single space is kept so the words don't fuse.
 */
export function replaceDashes(input: string, options: EmDashOptions): EmDashResult {
  const dash = options.includeEnDash ? '[—–]' : '—'
  let count = 0

  if (options.mode === 'hyphen') {
    const output = input.replace(new RegExp(dash, 'g'), () => {
      count++
      return '-'
    })
    return { output, count }
  }

  const run = new RegExp(`${HWS}*(${dash}+)${HWS}*`, 'g')
  const output = input.replace(run, (match, dashes: string, offset: number) => {
    count += dashes.length
    const before = input[offset - 1]
    const after = input[offset + match.length]
    const atLineStart = before === undefined || before === '\n' || before === '\r'
    const atLineEnd = after === undefined || after === '\n' || after === '\r'
    if (atLineStart || atLineEnd) return ''
    if (options.mode === 'comma') return ', '
    return match.length > dashes.length ? ' ' : ''
  })
  return { output, count }
}
