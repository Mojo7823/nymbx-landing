import type { AlgorithmId } from './hashEngine'
import type { Manifest } from './manifest'
import { statusLabels, type VerifyRow, type VerifySummary } from './verify'

export const algorithmLabels: Record<AlgorithmId, string> = {
  sha256: 'SHA-256',
  sha1: 'SHA-1',
  sha512: 'SHA-512',
  sha384: 'SHA-384',
  md5: 'MD5',
  blake2b: 'BLAKE2b',
  crc32: 'CRC32',
}

/** Display and computation order for the algorithm toggles. */
export const algorithmOrder: AlgorithmId[] = [
  'sha256',
  'sha1',
  'sha512',
  'sha384',
  'md5',
  'blake2b',
  'crc32',
]

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

/* ── Verification reports (manifest mode) ─────────────────────────────── */

/** `sha256sum -c` wording for each row status. */
function verifyWord(row: VerifyRow): string {
  switch (row.status) {
    case 'pass':
      return 'OK'
    case 'fail':
      return 'FAILED'
    case 'missing':
      return 'MISSING'
    case 'extra':
      return 'EXTRA (not in manifest)'
    case 'unsupported':
      return `UNSUPPORTED (${row.entry?.tag ?? 'unknown algorithm'})`
    case 'error':
      return 'ERROR (could not be read)'
    default:
      return 'PENDING'
  }
}

function manifestAlgorithms(manifest: Manifest): string {
  return manifest.algorithms.length > 0
    ? manifest.algorithms.map((a) => algorithmLabels[a]).join(', ')
    : 'no supported algorithm'
}

function summaryParts(summary: VerifySummary): string {
  const parts = [`${summary.pass} OK`]
  if (summary.fail) parts.push(`${summary.fail} FAILED`)
  if (summary.missing) parts.push(`${summary.missing} MISSING`)
  if (summary.extra) parts.push(`${summary.extra} EXTRA`)
  if (summary.unsupported) parts.push(`${summary.unsupported} UNSUPPORTED`)
  if (summary.error) parts.push(`${summary.error} ERROR`)
  if (summary.pending) parts.push(`${summary.pending} PENDING`)
  return parts.join(' · ')
}

/** `sha256sum -c` style report with a trailing summary comment. */
export function buildVerifyTxt(
  rows: VerifyRow[],
  summary: VerifySummary,
  manifest: Manifest,
  date = new Date(),
): string {
  const lines = rows.map((row) => `${row.path}: ${verifyWord(row)}`)
  const when = date.toISOString().slice(0, 10)
  return `${lines.join('\n')}\n\n# ${summaryParts(summary)} — manifest ${manifest.name} (${manifestAlgorithms(manifest)}), verified in the browser on ${when}\n`
}

/** One CRLF-terminated line per verification row. */
export function buildVerifyCsv(rows: VerifyRow[]): string {
  const lines = ['Status,Path,Algorithm,Expected,Actual,Size (bytes),Note']
  for (const row of rows) {
    const algo = row.entry?.algorithm
    lines.push(
      [
        statusLabels[row.status],
        csvField(row.path),
        csvField(algo ? algorithmLabels[algo] : (row.entry?.tag ?? '')),
        row.entry?.digest ?? '',
        row.actual ?? '',
        row.size === undefined ? '' : String(row.size),
        csvField(row.note ?? ''),
      ].join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}

/** Machine-readable report: manifest header, summary counters and every row. */
export function buildVerifyJson(
  rows: VerifyRow[],
  summary: VerifySummary,
  manifest: Manifest,
): string {
  return JSON.stringify(
    {
      manifest: {
        name: manifest.name,
        format: manifest.format,
        algorithms: manifest.algorithms,
      },
      summary,
      rows: rows.map((row) => ({
        status: row.status,
        path: row.path,
        algorithm: row.entry?.algorithm ?? row.entry?.tag ?? null,
        expected: row.entry?.digest ?? null,
        actual: row.actual ?? null,
        size: row.size ?? null,
        matchedBy: row.matchedBy ?? null,
        note: row.note ?? null,
      })),
    },
    null,
    2,
  )
}
