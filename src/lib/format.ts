const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

/** Human-readable byte size, e.g. 1536 → "1.5 KB". Base 1024. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '–'
  if (n < 1024) return `${n} B`
  let value = n
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  const rounded = value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, '')
  return `${rounded} ${UNITS[unit]}`
}

/**
 * `12.4 MB of 84.1 MB · 1.1 MB/s` — the numbers half of a download progress
 * label. Callers prefix it with what is being downloaded ("Downloading AI
 * model · …", "Downloading OCR engine · …"). Speed is dropped when unknown.
 */
export function transferLabel(loaded: number, total: number, bytesPerSecond?: number): string {
  const amounts = `${formatBytes(loaded)} of ${formatBytes(total)}`
  const speed =
    bytesPerSecond !== undefined && bytesPerSecond > 0 ? ` · ${formatBytes(bytesPerSecond)}/s` : ''
  return `${amounts}${speed}`
}
