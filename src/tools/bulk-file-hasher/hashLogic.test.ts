import { describe, expect, it } from 'vitest'
import {
  buildCsv,
  buildTxt,
  buildVerifyCsv,
  buildVerifyJson,
  buildVerifyTxt,
  normalizeExpected,
  type HashRow,
} from './hashLogic'
import { parseManifest } from './manifest'
import { summarize, type VerifyRow } from './verify'

describe('normalizeExpected', () => {
  it('lowercases and trims', () => {
    expect(normalizeExpected('  BA7816BF ')).toBe('ba7816bf')
  })

  it('takes the hash from a pasted `sha256sum` output line', () => {
    expect(normalizeExpected('900150983cd24fb0d6963f7d28e17f72  file.bin')).toBe(
      '900150983cd24fb0d6963f7d28e17f72',
    )
  })

  it('returns empty string for blank input', () => {
    expect(normalizeExpected('   ')).toBe('')
  })
})

const rows: HashRow[] = [
  { name: 'a.txt', size: 3, hashes: { sha256: 'aaa', md5: 'bbb' } },
  { name: 'weird,"name".bin', size: 10, hashes: { sha256: 'ccc' } },
]

describe('buildCsv', () => {
  it('emits a header and one line per file/algorithm pair', () => {
    const csv = buildCsv(rows, ['sha256', 'md5'])
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe('File,Size (bytes),Algorithm,Hash')
    expect(lines[1]).toBe('a.txt,3,SHA-256,aaa')
    expect(lines[2]).toBe('a.txt,3,MD5,bbb')
  })

  it('quotes file names containing commas and doubles embedded quotes', () => {
    const csv = buildCsv(rows, ['sha256'])
    expect(csv).toContain('"weird,""name"".bin",10,SHA-256,ccc')
  })

  it('skips algorithms a file has no hash for', () => {
    const csv = buildCsv(rows, ['md5'])
    expect(csv).not.toContain('weird')
  })
})

describe('buildTxt', () => {
  it('writes checksum-file style lines grouped per algorithm', () => {
    const txt = buildTxt(rows, ['sha256', 'md5'])
    expect(txt).toBe('# SHA-256\naaa  a.txt\nccc  weird,"name".bin\n\n# MD5\nbbb  a.txt\n')
  })
})

const manifest = parseManifest(
  `${'a'.repeat(64)}  README.md\n${'b'.repeat(64)}  bin/tool.js\n${'c'.repeat(64)}  bin/not-shipped.bin`,
  'SHA256SUMS',
)

const verifyRows: VerifyRow[] = [
  {
    status: 'pass',
    path: 'README.md',
    entry: manifest.entries[0]!,
    actual: 'a'.repeat(64),
    size: 64,
  },
  {
    status: 'fail',
    path: 'bin/tool.js',
    entry: manifest.entries[1]!,
    actual: 'd'.repeat(64),
    size: 65536,
  },
  { status: 'missing', path: 'bin/not-shipped.bin', entry: manifest.entries[2]! },
  { status: 'extra', path: 'extra,file.txt', size: 3, note: 'not in the manifest' },
]
const verifySummary = summarize(verifyRows)

describe('buildVerifyTxt', () => {
  const txt = buildVerifyTxt(verifyRows, verifySummary, manifest, new Date('2026-09-05T10:00:00Z'))

  it('writes one `sha256sum -c` style line per row', () => {
    const lines = txt.split('\n')
    expect(lines[0]).toBe('README.md: OK')
    expect(lines[1]).toBe('bin/tool.js: FAILED')
    expect(lines[2]).toBe('bin/not-shipped.bin: MISSING')
    expect(lines[3]).toBe('extra,file.txt: EXTRA (not in manifest)')
  })

  it('ends with a summary comment naming the manifest and the date', () => {
    expect(txt).toContain(
      '# 1 OK · 1 FAILED · 1 MISSING · 1 EXTRA — manifest SHA256SUMS (SHA-256), verified in the browser on 2026-09-05',
    )
  })
})

describe('buildVerifyCsv', () => {
  const csv = buildVerifyCsv(verifyRows)

  it('uses the documented header', () => {
    expect(csv.split('\r\n')[0]).toBe('Status,Path,Algorithm,Expected,Actual,Size (bytes),Note')
  })

  it('writes the expected and actual digests of a failure', () => {
    expect(csv).toContain(`FAIL,bin/tool.js,SHA-256,${'b'.repeat(64)},${'d'.repeat(64)},65536,`)
  })

  it('quotes paths containing commas', () => {
    expect(csv).toContain('EXTRA,"extra,file.txt",,,,3,not in the manifest')
  })
})

describe('buildVerifyJson', () => {
  it('round-trips the manifest header, summary and rows', () => {
    const json = JSON.parse(buildVerifyJson(verifyRows, verifySummary, manifest))
    expect(json.manifest).toEqual({
      name: 'SHA256SUMS',
      format: 'gnu',
      algorithms: ['sha256'],
    })
    expect(json.summary).toMatchObject({ pass: 1, fail: 1, missing: 1, extra: 1, total: 4 })
    expect(json.rows[1]).toMatchObject({
      status: 'fail',
      path: 'bin/tool.js',
      algorithm: 'sha256',
      expected: 'b'.repeat(64),
      actual: 'd'.repeat(64),
    })
  })
})
