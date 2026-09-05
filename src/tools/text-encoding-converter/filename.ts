/**
 * Output-filename rule, in its own module on purpose: the page chunk needs it
 * and nothing else from `convert.ts`, whose dependency graph reaches `detect.ts`
 * and therefore `chardet`. Keeping it here means chardet ships only in the
 * worker chunk.
 */

/** `report.big5.txt` → `report.big5.utf8.txt`; `README` → `README.utf8.txt`. */
export function outputFilename(name: string): string {
  const trimmed = name.trim() || 'converted'
  const dot = trimmed.lastIndexOf('.')
  if (dot <= 0) return `${trimmed}.utf8.txt`
  return `${trimmed.slice(0, dot)}.utf8${trimmed.slice(dot)}`
}
