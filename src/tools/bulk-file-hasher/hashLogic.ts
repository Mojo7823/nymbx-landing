import type { AlgorithmId } from './hashEngine'

export const algorithmLabels: Record<AlgorithmId, string> = {
  sha256: 'SHA-256',
  sha1: 'SHA-1',
  sha512: 'SHA-512',
  md5: 'MD5',
  crc32: 'CRC32',
}

/** Display and computation order for the algorithm toggles. */
export const algorithmOrder: AlgorithmId[] = ['sha256', 'sha1', 'sha512', 'md5', 'crc32']

export interface HashRow {
  name: string
  size: number
  hashes: Partial<Record<AlgorithmId, string>>
}

/**
 * Normalize a user-supplied expected hash: lowercase, trimmed, and reduced
 * to the first token so a full `sha256sum` output line can be pasted as-is.
 */
export function normalizeExpected(input: string): string {
  return input.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/** One `File,Size,Algorithm,Hash` line per computed hash, CRLF-terminated. */
export function buildCsv(rows: HashRow[], algorithms: AlgorithmId[]): string {
  const lines = ['File,Size (bytes),Algorithm,Hash']
  for (const row of rows) {
    for (const algo of algorithms) {
      const hash = row.hashes[algo]
      if (hash) lines.push(`${csvField(row.name)},${row.size},${algorithmLabels[algo]},${hash}`)
    }
  }
  return lines.join('\r\n') + '\r\n'
}

/**
 * Checksum-file style output: `<hash>  <name>` lines grouped under a
 * `# <algorithm>` comment per algorithm (the format `sha256sum -c` reads).
 */
export function buildTxt(rows: HashRow[], algorithms: AlgorithmId[]): string {
  const groups: string[] = []
  for (const algo of algorithms) {
    const lines = rows
      .filter((row) => row.hashes[algo])
      .map((row) => `${row.hashes[algo]}  ${row.name}`)
    if (lines.length > 0) groups.push(`# ${algorithmLabels[algo]}\n${lines.join('\n')}\n`)
  }
  return groups.join('\n')
}
