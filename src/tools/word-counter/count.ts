export interface TextStats {
  /** Characters as the user sees them: grapheme clusters, spaces included. */
  graphemes: number
  graphemesNoSpaces: number
  words: number
  sentences: number
  lines: number
  paragraphs: number
  /** Rough LLM token estimate: ~4 latin characters or ~1 CJK character per token. */
  tokens: number
  /** Rounded reading time at 200 words per minute; 0 only for empty text. */
  readingMinutes: number
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })

const WHITESPACE = /^\s+$/u
const CJK = /[⺀-鿿가-힯豈-﫿]/gu

const WORDS_PER_MINUTE = 200

export function countText(text: string): TextStats {
  if (text === '') {
    return {
      graphemes: 0,
      graphemesNoSpaces: 0,
      words: 0,
      sentences: 0,
      lines: 0,
      paragraphs: 0,
      tokens: 0,
      readingMinutes: 0,
    }
  }

  let graphemes = 0
  let graphemesNoSpaces = 0
  for (const { segment } of graphemeSegmenter.segment(text)) {
    graphemes++
    if (!WHITESPACE.test(segment)) graphemesNoSpaces++
  }

  let words = 0
  for (const { isWordLike } of wordSegmenter.segment(text)) {
    if (isWordLike) words++
  }

  let sentences = 0
  for (const { segment } of sentenceSegmenter.segment(text)) {
    if (!WHITESPACE.test(segment)) sentences++
  }

  const lines = text.split('\n').length
  const paragraphs = text.split(/\n{2,}/).filter((block) => !WHITESPACE.test(block)).length

  const cjkChars = text.match(CJK)?.length ?? 0
  const tokens = Math.ceil((text.length - cjkChars) / 4 + cjkChars)

  const readingMinutes = words === 0 ? 0 : Math.max(1, Math.round(words / WORDS_PER_MINUTE))

  return {
    graphemes,
    graphemesNoSpaces,
    words,
    sentences,
    lines,
    paragraphs,
    tokens,
    readingMinutes,
  }
}
