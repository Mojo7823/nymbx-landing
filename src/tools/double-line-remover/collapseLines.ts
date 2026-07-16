export type BlankLineMode = 'one' | 'zero'

export interface CollapseOptions {
  /** 'one' collapses runs of blank lines to a single blank line; 'zero' removes all blank lines. */
  mode: BlankLineMode
  /** Strip trailing spaces/tabs from every kept line. */
  trimTrailing: boolean
}

export interface CollapseResult {
  output: string
  /** Line count of the input. */
  linesBefore: number
  /** Line count of the output. */
  linesAfter: number
}

/** A line is blank when it is empty or contains only spaces/tabs. */
const BLANK = /^[^\S\n]*$/

function countLines(text: string): number {
  if (text === '') return 0
  return text.replace(/\r\n?/g, '\n').split('\n').length
}

/**
 * Collapse or remove runs of blank lines. Whitespace-only lines count as
 * blank; a kept blank line is always emptied. The input's line-ending style
 * (CRLF vs LF) and its trailing newline are preserved. Idempotent: running
 * the result through again changes nothing.
 */
export function collapseBlankLines(input: string, options: CollapseOptions): CollapseResult {
  const eol = input.includes('\r\n') ? '\r\n' : '\n'
  const normalized = input.replace(/\r\n?/g, '\n')
  const hadTrailingNewline = normalized.endsWith('\n')
  const body = hadTrailingNewline ? normalized.slice(0, -1) : normalized

  const out: string[] = []
  let blankRun = 0
  for (const line of body.split('\n')) {
    if (BLANK.test(line)) {
      blankRun++
      continue
    }
    if (blankRun > 0 && options.mode === 'one') out.push('')
    blankRun = 0
    out.push(options.trimTrailing ? line.replace(/[^\S\n]+$/, '') : line)
  }
  if (blankRun > 0 && options.mode === 'one') out.push('')

  const isEmpty = out.length === 0 || (out.length === 1 && out[0] === '' && input === '')
  const output = isEmpty ? '' : out.join(eol) + (hadTrailingNewline ? eol : '')

  return {
    output,
    linesBefore: countLines(input),
    linesAfter: countLines(output),
  }
}
