import type { AlgorithmId } from './hashEngine'
import { algorithmOrder } from './hashLogic'

/**
 * Checksum manifest parsing — GNU coreutils (`sha256sum`), BSD/`--tag`
 * (`SHA256 (file) = …`) and OpenSSL (`SHA2-256(file)= …`) styles.
 *
 * Pure: no DOM, no I/O. Everything a manifest can express that we cannot
 * compute (SHA3, BLAKE2s, …) still parses, with `algorithm: null`, so the
 * UI can show it as UNSUPPORTED instead of silently dropping the line.
 */

export interface ManifestEntry {
  /** Unescaped, `./` stripped, separators left as written. */
  path: string
  /** Lowercase hex. */
  digest: string
  /** `null` when the line names an algorithm this tool cannot compute. */
  algorithm: AlgorithmId | null
  /** The literal tag when the line carried one (BSD/OpenSSL). */
  tag?: string
  /** GNU binary-mode `*` flag — display only. */
  binary: boolean
  /** 1-based source line, for warnings. */
  line: number
}

export type ManifestFormat = 'gnu' | 'bsd' | 'openssl' | 'mixed'

export interface Manifest {
  name: string
  entries: ManifestEntry[]
  /** Distinct computable algorithms, in `algorithmOrder`. */
  algorithms: AlgorithmId[]
  format: ManifestFormat
  warnings: string[]
}

/** BSD / GNU `--tag`: `SHA256 (name) = hex`. The name may contain `)`. */
const BSD_RE = /^([A-Za-z0-9/_-]+) \((.*)\) = ([0-9a-fA-F]+)$/
/** OpenSSL `dgst`: `SHA2-256(name)= hex`. */
const OPENSSL_RE = /^([A-Za-z0-9-]+)\((.*)\)= ([0-9a-fA-F]+)$/
/** GNU: `hex<space(s)>[*]name`, optionally `\`-prefixed when the name is escaped. */
const GNU_RE = /^(\\?)([0-9a-fA-F]{8,128})[ \t]+(\*?)(.*)$/

const TAGS: Record<string, AlgorithmId> = {
  MD5: 'md5',
  SHA1: 'sha1',
  'SHA-1': 'sha1',
  SHA256: 'sha256',
  'SHA-256': 'sha256',
  'SHA2-256': 'sha256',
  SHA384: 'sha384',
  'SHA-384': 'sha384',
  'SHA2-384': 'sha384',
  SHA512: 'sha512',
  'SHA-512': 'sha512',
  'SHA2-512': 'sha512',
  BLAKE2B: 'blake2b',
  'BLAKE2B-512': 'blake2b',
  BLAKE2B512: 'blake2b',
  CRC32: 'crc32',
}

/** `SHA3-256`, `BLAKE2s`, `SHA512/256`, … parse but map to `null`. */
export function algorithmForTag(tag: string): AlgorithmId | null {
  return TAGS[tag.trim().toUpperCase()] ?? null
}

/** Hex length → algorithm, when nothing better identifies the line. */
export function algorithmForDigest(hexLength: number): AlgorithmId | null {
  switch (hexLength) {
    case 8:
      return 'crc32'
    case 32:
      return 'md5'
    case 40:
      return 'sha1'
    case 64:
      return 'sha256'
    case 96:
      return 'sha384'
    // 128 is also BLAKE2b-512 — only a tag or a `.b2` file name says so.
    case 128:
      return 'sha512'
    default:
      return null
  }
}

/** File-name hints: `SHA256SUMS`, `*.md5`, `release.sha512`, `README.b2`, … */
const NAME_ALGORITHMS: [RegExp, AlgorithmId][] = [
  [/^md5sums?(\.txt)?$|\.md5$/, 'md5'],
  [/^sha1sums?(\.txt)?$|\.sha1$/, 'sha1'],
  [/^sha256sums?(\.txt)?$|\.sha256$/, 'sha256'],
  [/^sha384sums?(\.txt)?$|\.sha384$/, 'sha384'],
  [/^sha512sums?(\.txt)?$|\.sha512$/, 'sha512'],
  [/^b2sums?(\.txt)?$|\.b2$|\.blake2b?$/, 'blake2b'],
]

/** Generic manifest names that carry no algorithm hint. */
const GENERIC_NAME =
  /^(check)?sums?(\.txt)?$|^checksums?(\.txt)?$|^shasums?(\.txt)?$|\.sums?$|\.checksums?$|\.hashe?s?$|\.digests?$/

function baseName(name: string): string {
  return name.split(/[\\/]/).pop() ?? name
}

export function algorithmForName(name: string): AlgorithmId | null {
  const base = baseName(name).toLowerCase()
  for (const [re, algo] of NAME_ALGORITHMS) if (re.test(base)) return algo
  return null
}

/** True for names that look like a checksum manifest (used for auto-adoption). */
export function looksLikeManifestName(name: string): boolean {
  const base = baseName(name).toLowerCase()
  const matches = (n: string) => algorithmForName(n) !== null || GENERIC_NAME.test(n)
  if (matches(base)) return true
  // Release folders also ship variants like `SHA256SUMS.bsd` or
  // `SHA256SUMS.binary` — drop one trailing extension and try again.
  const dot = base.lastIndexOf('.')
  return dot > 0 && matches(base.slice(0, dot))
}

/** `SHA256SUMS`, `MD5SUMS`, `CHECKSUMS`, `B2SUMS.txt`, … */
const CANONICAL_NAME = /^(md5|sha1|sha256|sha384|sha512|b2|check)sums?(\.txt)?$/

/**
 * Which of several checksum files in one drop to verify against.
 *
 * A release folder usually ships more than one (`SHA256SUMS`,
 * `SHA256SUMS.bsd`, `MD5SUMS`, …). Prefer a canonically named one, and
 * among those the strongest algorithm in `algorithmOrder`; when nothing is
 * canonical, only a single candidate is unambiguous enough to adopt.
 */
export function preferredManifest<T extends { name: string }>(candidates: T[]): T | null {
  const canonical = candidates.filter((c) => CANONICAL_NAME.test(baseName(c.name).toLowerCase()))
  if (canonical.length === 0) return candidates.length === 1 ? candidates[0]! : null
  const rank = (c: T) => {
    const algo = algorithmForName(c.name)
    return algo === null ? algorithmOrder.length : algorithmOrder.indexOf(algo)
  }
  return [...canonical].sort((a, b) => rank(a) - rank(b))[0]!
}

/** GNU escaping: the line starts with `\` and the name has `\\`, `\n`, `\r`. */
function unescapeName(name: string): string {
  return name.replace(/\\(\\|n|r)/g, (_, ch: string) =>
    ch === 'n' ? '\n' : ch === 'r' ? '\r' : '\\',
  )
}

function normalizePath(path: string): string {
  return path.startsWith('./') ? path.slice(2) : path
}

interface ParsedLine {
  path: string
  digest: string
  tag?: string
  binary: boolean
  kind: 'gnu' | 'bsd' | 'openssl'
}

function parseLine(raw: string): ParsedLine | null {
  const bsd = BSD_RE.exec(raw)
  if (bsd) {
    return { path: bsd[2]!, digest: bsd[3]!, tag: bsd[1]!, binary: false, kind: 'bsd' }
  }
  const openssl = OPENSSL_RE.exec(raw)
  if (openssl) {
    return {
      path: openssl[2]!,
      digest: openssl[3]!,
      tag: openssl[1]!,
      binary: false,
      kind: 'openssl',
    }
  }
  const gnu = GNU_RE.exec(raw)
  if (gnu && gnu[4]!.length > 0) {
    const escaped = gnu[1] === '\\'
    return {
      path: escaped ? unescapeName(gnu[4]!) : gnu[4]!,
      digest: gnu[2]!,
      binary: gnu[3] === '*',
      kind: 'gnu',
    }
  }
  return null
}

/**
 * Parse a checksum manifest. Unparseable lines become warnings, never
 * errors — GNU `--check` also reports "improperly formatted" and continues.
 */
export function parseManifest(text: string, name = 'pasted text'): Manifest {
  const entries: ManifestEntry[] = []
  const warnings: string[] = []
  const kinds = new Set<'gnu' | 'bsd' | 'openssl'>()
  const seen = new Map<string, number>()
  const nameHint = algorithmForName(name)

  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.replace(/\r$/, '')
    const lineNo = i + 1
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue

    const parsed = parseLine(raw)
    if (!parsed) {
      warnings.push(`Line ${lineNo}: not a checksum line`)
      continue
    }

    const path = normalizePath(parsed.path)
    const digest = parsed.digest.toLowerCase()
    // Tag wins over the file name, which wins over the digest length.
    const algorithm = parsed.tag
      ? algorithmForTag(parsed.tag)
      : (nameHint ?? algorithmForDigest(digest.length))

    const duplicate = seen.get(path)
    if (duplicate !== undefined) {
      warnings.push(`Line ${lineNo}: duplicate entry for ${path} (first one kept)`)
      continue
    }
    seen.set(path, lineNo)
    kinds.add(parsed.kind)
    entries.push({
      path,
      digest,
      algorithm,
      ...(parsed.tag ? { tag: parsed.tag } : {}),
      binary: parsed.binary,
      line: lineNo,
    })
  }

  const used = new Set(entries.map((e) => e.algorithm).filter((a): a is AlgorithmId => a !== null))
  const format: ManifestFormat =
    kinds.size === 1 ? [...kinds][0]! : kinds.size === 0 ? 'gnu' : 'mixed'

  return {
    name,
    entries,
    algorithms: algorithmOrder.filter((a) => used.has(a)),
    format,
    warnings,
  }
}

export const formatLabels: Record<ManifestFormat, string> = {
  gnu: 'GNU',
  bsd: 'BSD',
  openssl: 'OpenSSL',
  mixed: 'mixed',
}
