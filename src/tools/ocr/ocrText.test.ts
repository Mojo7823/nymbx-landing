import { describe, expect, it } from 'vitest'
import {
  assembleMd,
  assembleTxt,
  LOW_CONFIDENCE,
  MIN_WORDS,
  outputFileName,
  pageQuality,
  pageTitle,
  wordCount,
  type OcrPage,
} from './ocrText'

function page(over: Partial<OcrPage> = {}): OcrPage {
  return { sourceName: 'scan.pdf', pageNumber: 1, text: 'hello world', confidence: 92, ...over }
}

describe('wordCount', () => {
  it('counts whitespace-separated words', () => {
    expect(wordCount('the quick brown fox')).toBe(4)
  })

  it('ignores punctuation-only tokens and collapsed whitespace', () => {
    expect(wordCount('  hello ,  — world \n\n !! ')).toBe(2)
  })

  it('counts CJK characters individually, since Chinese has no spaces', () => {
    // Would be 1 "word" by whitespace, and would wrongly read as an empty page.
    expect(wordCount('這是一段中文字')).toBe(7)
  })

  it('handles mixed CJK and Latin', () => {
    expect(wordCount('NYMBX 工具箱 v2')).toBe(2 + 3)
  })

  it('is zero for blank text', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   \n\t  ')).toBe(0)
  })
})

describe('pageQuality', () => {
  it('flags a page with too few words as empty regardless of confidence', () => {
    expect(pageQuality({ text: 'a b', confidence: 99 })).toBe('empty')
    expect(wordCount('a b')).toBeLessThan(MIN_WORDS)
  })

  it('flags low confidence once there is enough text', () => {
    expect(pageQuality({ text: 'one two three four', confidence: LOW_CONFIDENCE - 1 })).toBe('low')
  })

  it('accepts confident text at the threshold', () => {
    expect(pageQuality({ text: 'one two three four', confidence: LOW_CONFIDENCE })).toBe('ok')
  })

  it('does not call a short CJK line empty', () => {
    expect(pageQuality({ text: '中文測試', confidence: 88 })).toBe('ok')
  })
})

describe('pageTitle', () => {
  it('names a PDF page', () => {
    expect(pageTitle({ sourceName: 'scan.pdf', pageNumber: 3 })).toBe('scan.pdf · page 3')
  })

  it('names a single image without a page number', () => {
    expect(pageTitle({ sourceName: 'receipt.png', pageNumber: null })).toBe('receipt.png')
  })
})

describe('assembleTxt', () => {
  it('joins pages with a blank line and a rule', () => {
    expect(assembleTxt([page({ text: 'one' }), page({ text: 'two', pageNumber: 2 })])).toBe(
      'one\n\n---\n\ntwo',
    )
  })

  it('trims Tesseract page padding but keeps internal blank lines', () => {
    expect(assembleTxt([page({ text: '\n\nline a\n\nline b   \n\n\n' })])).toBe('line a\n\nline b')
  })

  it('keeps an empty page as an empty section rather than dropping it', () => {
    expect(assembleTxt([page({ text: '' }), page({ text: 'two', pageNumber: 2 })])).toBe(
      '\n\n---\n\ntwo',
    )
  })
})

describe('assembleMd', () => {
  it('puts a heading above every page', () => {
    expect(assembleMd([page({ text: 'one' }), page({ text: 'two', pageNumber: 2 })])).toBe(
      '## scan.pdf — page 1\n\none\n\n## scan.pdf — page 2\n\ntwo',
    )
  })

  it('omits the page number for a single image', () => {
    expect(assembleMd([page({ sourceName: 'a.png', pageNumber: null, text: 'x' })])).toBe(
      '## a.png\n\nx',
    )
  })
})

describe('outputFileName', () => {
  it('replaces the extension', () => {
    expect(outputFileName('scan.pdf', 'txt')).toBe('scan.ocr.txt')
    expect(outputFileName('photo.jpeg', 'md')).toBe('photo.ocr.md')
  })

  it('keeps dots inside the stem', () => {
    expect(outputFileName('report.v2.final.pdf', 'txt')).toBe('report.v2.final.ocr.txt')
  })

  it('handles a name with no extension', () => {
    expect(outputFileName('scan', 'txt')).toBe('scan.ocr.txt')
  })

  it('falls back when there is no usable stem', () => {
    expect(outputFileName('.gitignore', 'txt')).toBe('ocr.txt')
    expect(outputFileName('', 'md')).toBe('ocr.md')
  })
})
