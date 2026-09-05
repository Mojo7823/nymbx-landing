import type { Changes } from './types'

/**
 * `report.pdf` → `report-clean.pdf` when everything was stripped, otherwise
 * `report-edited.pdf` — the `-edited` / `-compressed` convention the other PDF
 * tools use.
 */
export function outputFilename(name: string, changes: Changes): string {
  const trimmed = name.trim() || 'document.pdf'
  const stem = trimmed.replace(/\.pdf$/i, '')
  const suffix = changes.info === 'remove' && changes.xmp === 'remove' ? 'clean' : 'edited'
  return `${stem}-${suffix}.pdf`
}
