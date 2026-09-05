import { describe, expect, it } from 'vitest'
import {
  buildPreview,
  candidateFor,
  detectBom,
  detectEncoding,
  PREVIEW_CHARS,
  textPlausibility,
} from './detect'
import samples from './fixtures/samples.json'

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function sampleFor(predicate: (s: (typeof samples.samples)[number]) => boolean) {
  const found = samples.samples.find(predicate)
  if (!found) throw new Error('fixture not found')
  return found
}

/**
 * What §4 of the handout allows as the first candidate for each fixture.
 * `gbk` files are reported as `gb18030` (the only Chinese simplified entry we
 * list), Greek may come back as either windows-1253 or iso-8859-7, and Thai
 * is only required to be present, not first (chardet mis-ranks it).
 */
const FIRST_CANDIDATE: Record<string, string[]> = {
  big5: ['big5'],
  gbk: ['gb18030'],
  gb18030: ['gb18030'],
  shift_jis: ['shift_jis'],
  'euc-jp': ['euc-jp'],
  'euc-kr': ['euc-kr'],
  'iso-2022-jp': ['iso-2022-jp'],
  'windows-1252': ['windows-1252'],
  'iso-8859-2': ['iso-8859-2'],
  'windows-1250': ['windows-1250', 'iso-8859-2'],
  'windows-1251': ['windows-1251'],
  'koi8-r': ['koi8-r'],
  'windows-1253': ['windows-1253', 'iso-8859-7'],
  'windows-874': [],
  'utf-16le': ['utf-16le'],
  'utf-16be': ['utf-16be'],
  'utf-8': ['utf-8'],
}

describe('detectBom', () => {
  it('recognises the three BOMs and nothing else', () => {
    expect(detectBom(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('utf-8')
    expect(detectBom(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe('utf-16le')
    expect(detectBom(new Uint8Array([0xfe, 0xff, 0x00, 0x41]))).toBe('utf-16be')
    expect(detectBom(new Uint8Array([0x41, 0x42]))).toBeNull()
    expect(detectBom(new Uint8Array(0))).toBeNull()
  })
})

describe('detectEncoding on the fixtures', () => {
  for (const [index, sample] of samples.samples.entries()) {
    it(`ranks ${sample.label}${sample.bom ? ' (BOM)' : ''} (#${index})`, () => {
      const bytes = base64ToBytes(sample.base64)
      const { candidates, bom } = detectEncoding(bytes)
      expect(candidates.length).toBeGreaterThan(0)

      const allowed = FIRST_CANDIDATE[sample.label] ?? [sample.label]
      if (allowed.length > 0) {
        expect(allowed, `${sample.label} first candidate was ${candidates[0].label}`).toContain(
          candidates[0].label,
        )
      } else {
        // windows-874: only required to be present and valid.
        const entry = candidates.find((c) => c.label === sample.label)
        expect(entry, 'windows-874 candidate missing').toBeDefined()
        expect(entry!.valid).toBe(true)
      }

      expect(bom).toBe(sample.bom ?? null)
      if (sample.bom) {
        expect(candidates[0].label).toBe(sample.bom)
        expect(candidates[0].confidence).toBe(100)
        expect(candidates[0].reasons).toContain('Byte order mark')
      }
    })
  }

  it('reports the right endianness for UTF-16 without a BOM', () => {
    for (const label of ['utf-16le', 'utf-16be'] as const) {
      const sample = sampleFor((s) => s.label === label && !s.bom)
      const { bom, candidates } = detectEncoding(base64ToBytes(sample.base64))
      expect(bom).toBeNull()
      expect(candidates[0].label).toBe(label)
      // Japanese UTF-16 has almost no zero bytes, so it is the text
      // plausibility signal rather than the null-byte one that fires here.
      expect(candidates[0].reasons[0]).toMatch(/coherent text/)
      expect(candidates[0].confidence).toBe(85)
      // …and it still works on a 48-byte prefix (the rule's minimum).
      const prefix = base64ToBytes(sample.base64).subarray(0, 48)
      expect(detectEncoding(prefix).candidates[0].label).toBe(label)
    }
  })

  it('never ranks UTF-16 first for a legacy or UTF-8 fixture, at any even prefix length', () => {
    // Regression: Shift_JIS / EUC-JP prefixes have one steady byte per pair
    // just like UTF-16, and used to trip a byte-variety heuristic.
    for (const sample of samples.samples) {
      if (sample.label.startsWith('utf-16')) continue
      const bytes = base64ToBytes(sample.base64)
      for (let length = 16; length <= bytes.length; length += 2) {
        const top = detectEncoding(bytes.subarray(0, length)).candidates[0]
        expect(top?.label.startsWith('utf-16'), `${sample.label} @ ${length} → ${top?.label}`).toBe(
          false,
        )
      }
    }
  })

  it('uses the null-byte pattern for mostly-ASCII UTF-16 without a BOM', () => {
    const text = 'The quick brown fox jumps over the lazy dog, again and again.\n'
    for (const [label, littleEndian] of [
      ['utf-16le', true],
      ['utf-16be', false],
    ] as const) {
      const bytes = new Uint8Array(text.length * 2)
      const view = new DataView(bytes.buffer)
      for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), littleEndian)
      const { candidates } = detectEncoding(bytes)
      expect(candidates[0].label).toBe(label)
      expect(candidates[0].reasons).toContain('Null-byte pattern (every second byte)')
    }
  })

  it('still detects Big5 from a 48-byte prefix', () => {
    const sample = sampleFor((s) => s.label === 'big5')
    const prefix = base64ToBytes(sample.base64).subarray(0, 48)
    expect(detectEncoding(prefix).candidates[0].label).toBe('big5')
  })
})

describe('detectEncoding edge cases', () => {
  it('returns no candidates for an empty file', () => {
    expect(detectEncoding(new Uint8Array(0))).toEqual({
      bom: null,
      candidates: [],
      looksBinary: false,
    })
  })

  it('reports pure ASCII as a single UTF-8 candidate', () => {
    const bytes = new TextEncoder().encode('Hello, world!\r\nPlain ASCII only.\r\n')
    const { candidates, looksBinary } = detectEncoding(bytes)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].label).toBe('utf-8')
    expect(candidates[0].reasons).toEqual([
      'ASCII only — identical in every ASCII-compatible encoding',
    ])
    expect(candidates[0].valid).toBe(true)
    expect(looksBinary).toBe(false)
  })

  it('flags binary input', () => {
    const bytes = new Uint8Array(1024)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256
    expect(detectEncoding(bytes).looksBinary).toBe(true)
  })

  it('clamps the confidence of invalid candidates and counts the bad sequences', () => {
    // Valid Big5, so a fatal UTF-8 decode fails.
    const bytes = base64ToBytes(sampleFor((s) => s.label === 'big5').base64)
    const manual = candidateFor(bytes, 'utf-8')
    expect(manual.valid).toBe(false)
    expect(manual.invalidSequences).toBeGreaterThan(0)
    expect(manual.confidence).toBeLessThanOrEqual(20)
    expect(manual.band).toBe('low')
    expect(manual.reasons[0]).toBe('Chosen manually')
    expect(manual.reasons[1]).toMatch(/undecodable sequences$/)
  })

  it('sorts valid candidates ahead of invalid ones', () => {
    const bytes = base64ToBytes(sampleFor((s) => s.label === 'shift_jis').base64)
    const { candidates } = detectEncoding(bytes)
    const firstInvalid = candidates.findIndex((c) => !c.valid)
    if (firstInvalid !== -1) {
      expect(candidates.slice(firstInvalid).every((c) => !c.valid)).toBe(true)
    }
  })
})

describe('textPlausibility', () => {
  it('scores prose near 1 and byte-swapped garbage well below 0.95', () => {
    expect(
      textPlausibility('日本語のテスト：東京は世界で最も人口の多い都市の一つです。\n'),
    ).toBeGreaterThan(0.97)
    expect(textPlausibility('Café crème, déjà vu — naïve façade.\n')).toBe(1)
    // Private-use and replacement characters count against the text.
    expect(textPlausibility('\uE000\uE001\uFFFD\uFFFDab')).toBe(1 / 3)
    expect(textPlausibility('')).toBe(0)
    // The Japanese fixture read in the wrong byte order.
    const sample = sampleFor((s) => s.label === 'utf-16le' && !s.bom)
    const swapped = new TextDecoder('utf-16be').decode(base64ToBytes(sample.base64))
    expect(textPlausibility(swapped)).toBeLessThan(0.95)
  })
})

describe('buildPreview', () => {
  it('collapses whitespace and clips to 160 code points', () => {
    const text = `line one\n\n  line   two\t${'x'.repeat(400)}`
    const preview = buildPreview(new TextEncoder().encode(text), 'utf-8')
    expect(preview.startsWith('line one line two x')).toBe(true)
    expect([...preview]).toHaveLength(PREVIEW_CHARS)
  })

  it('drops a leading BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69])
    expect(buildPreview(bytes, 'utf-8')).toBe('hi')
  })
})
