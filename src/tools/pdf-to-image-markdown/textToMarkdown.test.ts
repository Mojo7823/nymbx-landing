import { describe, expect, it } from 'vitest'
import { pagesToMarkdown, type MdTextItem } from './textToMarkdown'

/** Build one text item that represents a whole line at the given baseline. */
function line(
  str: string,
  opts: { y: number; size?: number; x?: number; width?: number; hasEOL?: boolean } = { y: 700 },
): MdTextItem {
  const size = opts.size ?? 10
  return {
    str,
    fontSize: size,
    x: opts.x ?? 72,
    y: opts.y,
    width: opts.width ?? str.length * size * 0.5,
    hasEOL: opts.hasEOL ?? false,
  }
}

describe('pagesToMarkdown — basics', () => {
  it('returns an empty string for no pages or empty pages', () => {
    expect(pagesToMarkdown([])).toBe('')
    expect(pagesToMarkdown([[], []])).toBe('')
  })

  it('merges consecutive close lines into one paragraph', () => {
    const md = pagesToMarkdown([
      [line('The quick brown fox', { y: 700 }), line('jumps over the lazy dog.', { y: 688 })],
    ])
    expect(md).toBe('The quick brown fox jumps over the lazy dog.')
  })

  it('starts a new paragraph after a large vertical gap', () => {
    const md = pagesToMarkdown([
      [line('First paragraph.', { y: 700 }), line('Second paragraph.', { y: 660 })],
    ])
    expect(md).toBe('First paragraph.\n\nSecond paragraph.')
  })

  it('keeps pages as separate blocks in order', () => {
    const md = pagesToMarkdown([
      [line('Page one text.', { y: 700 })],
      [line('Page two text.', { y: 700 })],
    ])
    expect(md).toBe('Page one text.\n\nPage two text.')
  })
})

describe('pagesToMarkdown — item joining within a line', () => {
  it('inserts a space between items separated by a visible gap', () => {
    const a = line('Hello', { y: 700, x: 72, width: 50 })
    const b = line('world', { y: 700, x: 126, width: 50 }) // 4pt gap
    expect(pagesToMarkdown([[a, b]])).toBe('Hello world')
  })

  it('joins directly adjacent items without adding a space', () => {
    const a = line('Hel', { y: 700, x: 72, width: 30 })
    const b = line('lo', { y: 700, x: 102.4, width: 20 }) // sub-threshold gap
    expect(pagesToMarkdown([[a, b]])).toBe('Hello')
  })
})

describe('pagesToMarkdown — heading heuristics', () => {
  const body = [
    line('Body text that fills out the document with plenty of characters.', { y: 640 }),
    line('More body text so the dominant font size is unambiguous here.', { y: 628 }),
  ]

  it('turns the largest distinct font size into an H1', () => {
    const md = pagesToMarkdown([[line('Document Title', { y: 720, size: 18 }), ...body]])
    expect(md.startsWith('# Document Title\n\n')).toBe(true)
  })

  it('maps descending sizes to #, ##, ###', () => {
    const md = pagesToMarkdown([
      [
        line('Title', { y: 760, size: 18 }),
        line('Section', { y: 720, size: 14 }),
        line('Subsection', { y: 690, size: 12 }),
        ...body,
      ],
    ])
    expect(md).toContain('# Title')
    expect(md).toContain('## Section')
    expect(md).toContain('### Subsection')
  })

  it('produces no headings when every line has the same size', () => {
    const md = pagesToMarkdown([
      [line('All the same.', { y: 700 }), line('Still the same.', { y: 660 })],
    ])
    expect(md).toBe('All the same.\n\nStill the same.')
  })

  it('does not treat a very long large-font line as a heading', () => {
    const longLine = 'Large print body text. '.repeat(12).trim() // > 200 chars
    const md = pagesToMarkdown([[line(longLine, { y: 720, size: 18 }), ...body]])
    expect(md).toContain('Large print body text.')
    expect(md).not.toContain('# Large print')
  })

  it('picks the body size by character volume, not line count', () => {
    // Many short 8pt captions must not make 8pt the body size,
    // which would wrongly promote every 10pt body line to a heading.
    const captions = [1, 2, 3, 4].map((i) => line(`fig ${i}`, { y: 500 - i * 20, size: 8 }))
    const md = pagesToMarkdown([
      [
        line('Real Title', { y: 760, size: 18 }),
        line('Body copy with far more characters than all captions combined here.', { y: 720 }),
        line('And a second long body line keeps ten point clearly dominant.', { y: 708 }),
        ...captions,
      ],
    ])
    expect(md).toContain('# Real Title')
    expect(md).not.toContain('# Body copy')
    expect(md).not.toContain('# fig')
  })
})

describe('pagesToMarkdown — markdown safety', () => {
  it('escapes a body line that would otherwise parse as a heading', () => {
    const md = pagesToMarkdown([[line('#hashtag is not a heading', { y: 700 })]])
    expect(md).toBe('\\#hashtag is not a heading')
  })
})
