/** Pure helpers for the OCR tool: quality thresholds and output assembly. */

/** Mean word confidence below this gets a "check this page" warning. */
export const LOW_CONFIDENCE = 60

/** Fewer recognized words than this counts as "nothing found". */
export const MIN_WORDS = 3

export interface OcrPage {
  /** Source file name, e.g. `scan.pdf` or `receipt.png`. */
  sourceName: string
  /** 1-based page number for PDFs; `null` for a single image. */
  pageNumber: number | null
  text: string
  /** Mean word confidence, 0–100. */
  confidence: number
}

/**
 * Words in recognized text.
 *
 * Chinese is written without spaces, so whitespace tokenizing would report a
 * whole paragraph as one word and trip the "no text found" threshold. CJK
 * ideographs are therefore counted individually and everything else by
 * whitespace-separated runs that contain at least one letter or digit.
 */
export function wordCount(text: string): number {
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0
  const rest = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu, ' ')
  const words = rest.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
  return cjk + words
}

export type PageQuality = 'empty' | 'low' | 'ok'

export function pageQuality(page: Pick<OcrPage, 'text' | 'confidence'>): PageQuality {
  if (wordCount(page.text) < MIN_WORDS) return 'empty'
  return page.confidence < LOW_CONFIDENCE ? 'low' : 'ok'
}

/** `scan.pdf · page 3` for a PDF page, `receipt.png` for an image. */
export function pageTitle(page: Pick<OcrPage, 'sourceName' | 'pageNumber'>): string {
  return page.pageNumber === null ? page.sourceName : `${page.sourceName} · page ${page.pageNumber}`
}

function trimmed(text: string): string {
  // Tesseract pads pages with blank lines; keep the shape, drop the padding.
  return text.replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '')
}

/** Plain text: pages separated by a blank line, a `---` line and a blank line. */
export function assembleTxt(pages: readonly OcrPage[]): string {
  return pages.map((page) => trimmed(page.text)).join('\n\n---\n\n')
}

/** Markdown: an `## source — page N` heading above each page's text. */
export function assembleMd(pages: readonly OcrPage[]): string {
  return pages
    .map((page) => {
      const heading =
        page.pageNumber === null
          ? `## ${page.sourceName}`
          : `## ${page.sourceName} — page ${page.pageNumber}`
      return `${heading}\n\n${trimmed(page.text)}`
    })
    .join('\n\n')
}

/** `scan.pdf` + `txt` → `scan.ocr.txt`. Falls back to `ocr.<ext>`. */
export function outputFileName(sourceName: string, extension: string): string {
  const stem = sourceName.replace(/\.[^./\\]+$/, '').trim()
  return stem.length > 0 ? `${stem}.ocr.${extension}` : `ocr.${extension}`
}
