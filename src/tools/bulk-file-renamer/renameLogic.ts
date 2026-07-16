export type CaseTransform = 'none' | 'lower' | 'upper' | 'title'

export interface NumberingOptions {
  enabled: boolean
  position: 'prefix' | 'suffix'
  start: number
  pad: number
}

export interface RenameOptions {
  find: string
  replace: string
  useRegex: boolean
  prefix: string
  suffix: string
  caseTransform: CaseTransform
  numbering: NumberingOptions
}

export const defaultOptions: RenameOptions = {
  find: '',
  replace: '',
  useRegex: false,
  prefix: '',
  suffix: '',
  caseTransform: 'none',
  numbering: { enabled: false, position: 'suffix', start: 1, pad: 3 },
}

export type RowStatus = 'renamed' | 'unchanged' | 'conflict' | 'invalid'

export interface RenameRow {
  oldName: string
  newName: string
  status: RowStatus
}

export interface RenamePlan {
  rows: RenameRow[]
  /** True when any row is a conflict/invalid (or the regex is bad) — export must be blocked. */
  hasBlocking: boolean
  /** Human-readable regex error, when `find` is not a valid pattern. */
  error?: string
}

/**
 * Split a filename into base and extension. The extension is the final
 * `.suffix` only; a leading dot (dotfiles like `.gitignore`) is part of the
 * base, never an extension.
 */
function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

function applyCase(base: string, transform: CaseTransform): string {
  switch (transform) {
    case 'lower':
      return base.toLowerCase()
    case 'upper':
      return base.toUpperCase()
    case 'title':
      return base
        .toLowerCase()
        .replace(
          /(^|[^\p{L}\p{N}])(\p{L})/gu,
          (_, sep: string, ch: string) => sep + ch.toUpperCase(),
        )
    case 'none':
      return base
  }
}

/** Names that cannot be written into a zip / extracted safely. */
function isInvalidName(name: string): boolean {
  if (name === '' || name === '.' || name === '..') return true
  // eslint-disable-next-line no-control-regex
  return /[/\\\x00-\x1f]/.test(name)
}

/** Compute the rename preview for `names` (in list order) under `options`. */
export function buildRenamePlan(names: string[], options: RenameOptions): RenamePlan {
  let pattern: RegExp | null = null
  if (options.find !== '' && options.useRegex) {
    try {
      pattern = new RegExp(options.find, 'g')
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      return {
        rows: names.map((n) => ({ oldName: n, newName: n, status: 'unchanged' })),
        hasBlocking: true,
        error: `Invalid regex: ${detail}`,
      }
    }
  }

  const rows: RenameRow[] = names.map((oldName, index) => {
    const { base, ext } = splitName(oldName)
    let next = base

    if (options.find !== '') {
      next = pattern
        ? next.replace(pattern, options.replace)
        : next.replaceAll(options.find, options.replace)
    }
    next = applyCase(next, options.caseTransform)
    next = options.prefix + next + options.suffix

    const { enabled, position, start, pad } = options.numbering
    if (enabled) {
      const num = String(start + index).padStart(pad, '0')
      next = position === 'prefix' ? `${num}-${next}` : `${next}-${num}`
    }

    const newName = next + ext
    return {
      oldName,
      newName,
      status: isInvalidName(newName) ? 'invalid' : oldName === newName ? 'unchanged' : 'renamed',
    }
  })

  // Two files mapping to one target (case-insensitively — Windows/macOS
  // filesystems collapse case) is a conflict that blocks the export.
  const byTarget = new Map<string, number[]>()
  rows.forEach((row, i) => {
    const key = row.newName.toLowerCase()
    byTarget.set(key, [...(byTarget.get(key) ?? []), i])
  })
  for (const indexes of byTarget.values()) {
    if (indexes.length > 1) {
      for (const i of indexes) {
        if (rows[i].status !== 'invalid') rows[i].status = 'conflict'
      }
    }
  }

  return {
    rows,
    hasBlocking: rows.some((r) => r.status === 'conflict' || r.status === 'invalid'),
  }
}
