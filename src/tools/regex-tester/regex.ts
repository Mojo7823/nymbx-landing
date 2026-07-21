export interface GroupValue {
  /** 1-based capture-group number. */
  number: number
  value: string | undefined
  /** The group's name, when the pattern gives it one. */
  name?: string
}

export interface NamedGroupValue {
  name: string
  value: string | undefined
}

export interface RegexMatch {
  index: number
  end: number
  value: string
  groups: GroupValue[]
  named: NamedGroupValue[]
}

export interface RegexRunResult {
  matches: RegexMatch[]
  /** Present when a replacement string was given. */
  replaced?: string
  /** True when the match list was capped at MATCH_LIMIT. */
  truncated: boolean
}

export const MATCH_LIMIT = 2000

export function runRegex(
  pattern: string,
  flags: string,
  text: string,
  replacement?: string,
): RegexRunResult {
  const re = new RegExp(pattern, flags)
  const names = groupNames(pattern, flags)
  const matches: RegexMatch[] = []
  let truncated = false

  // A manual exec loop covers g, sticky-only y, and single-match modes alike.
  for (let match = re.exec(text); match !== null; match = re.exec(text)) {
    if (matches.length >= MATCH_LIMIT) {
      truncated = true
      break
    }
    matches.push(toMatch(match, names))
    if (!re.global && !re.sticky) break
    // Zero-length matches leave lastIndex in place; bump it to avoid looping
    // forever. Under u/v, advance by code point (spec AdvanceStringIndex) —
    // a lastIndex inside a surrogate pair would be rounded back down.
    if (match[0] === '') {
      if (re.lastIndex >= text.length) break
      const unicodeMode = re.unicode || flags.includes('v')
      const wide = unicodeMode && text.codePointAt(re.lastIndex)! > 0xffff
      re.lastIndex += wide ? 2 : 1
    }
  }

  return {
    matches,
    replaced:
      replacement !== undefined ? text.replace(new RegExp(pattern, flags), replacement) : undefined,
    truncated,
  }
}

function toMatch(match: RegExpExecArray, names: (string | undefined)[]): RegexMatch {
  const groups: GroupValue[] = []
  for (let i = 1; i < match.length; i++) {
    groups.push({ number: i, value: match[i], name: names[i - 1] })
  }
  const named: NamedGroupValue[] = match.groups
    ? Object.entries(match.groups).map(([name, value]) => ({ name, value }))
    : []
  return {
    index: match.index,
    end: match.index + match[0].length,
    value: match[0],
    groups,
    named,
  }
}

/**
 * Capture-group names by group number (index 0 = group 1), from a scan of the
 * pattern source: `(` opens a numbered group unless followed by `?`, and
 * `(?<name>` — but not lookbehind `(?<=` / `(?<!` — names it. Escapes and
 * character classes (nested under the v flag) are skipped.
 */
function groupNames(pattern: string, flags: string): (string | undefined)[] {
  const names: (string | undefined)[] = []
  const nestedClasses = flags.includes('v')
  let classDepth = 0
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '\\') {
      i++
    } else if (classDepth > 0) {
      if (char === ']') classDepth--
      else if (char === '[' && nestedClasses) classDepth++
    } else if (char === '[') {
      classDepth = 1
    } else if (char === '(') {
      if (pattern[i + 1] !== '?') {
        names.push(undefined)
      } else if (pattern[i + 2] === '<' && pattern[i + 3] !== '=' && pattern[i + 3] !== '!') {
        const end = pattern.indexOf('>', i + 3)
        names.push(end === -1 ? undefined : pattern.slice(i + 3, end))
      }
    }
  }
  return names
}
