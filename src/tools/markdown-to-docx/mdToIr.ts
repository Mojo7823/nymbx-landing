import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

/** One formatted run of inline content. */
export interface InlineRun {
  text?: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  /** Href when the run sits inside a link. */
  link?: string
  /** Image runs carry no text. */
  image?: { src: string; alt: string }
  /** Explicit line break (markdown hard break). */
  break?: boolean
}

export interface ListInfo {
  type: 'bullet' | 'ordered'
  /** Nesting depth, 0-based. */
  level: number
  /** Unique per ordered list so numbering restarts between lists. */
  listId: number
}

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; runs: InlineRun[] }
  | { kind: 'paragraph'; runs: InlineRun[]; list?: ListInfo; indentLevel?: number; quote?: boolean }
  | { kind: 'code'; text: string; lang: string }
  | { kind: 'hr' }
  | { kind: 'table'; header: InlineRun[][]; rows: InlineRun[][][] }

export interface IrResult {
  blocks: Block[]
  warnings: string[]
}

function inlineRuns(children: Token[] | null, warnings: string[]): InlineRun[] {
  const runs: InlineRun[] = []
  let bold = 0
  let italic = 0
  let strike = 0
  let link: string | null = null

  const flags = () => ({
    ...(bold > 0 && { bold: true }),
    ...(italic > 0 && { italic: true }),
    ...(strike > 0 && { strike: true }),
    ...(link !== null && { link }),
  })

  for (const t of children ?? []) {
    switch (t.type) {
      case 'text':
        if (t.content) runs.push({ text: t.content, ...flags() })
        break
      case 'strong_open':
        bold++
        break
      case 'strong_close':
        bold--
        break
      case 'em_open':
        italic++
        break
      case 'em_close':
        italic--
        break
      case 's_open':
        strike++
        break
      case 's_close':
        strike--
        break
      case 'code_inline':
        runs.push({ text: t.content, code: true, ...flags() })
        break
      case 'link_open':
        link = t.attrGet('href') ?? ''
        break
      case 'link_close':
        link = null
        break
      case 'image':
        runs.push({ image: { src: t.attrGet('src') ?? '', alt: t.content } })
        break
      case 'softbreak':
        runs.push({ text: ' ', ...flags() })
        break
      case 'hardbreak':
        runs.push({ break: true })
        break
      case 'html_inline':
        if (!warnings.includes('Inline HTML is not converted.'))
          warnings.push('Inline HTML is not converted.')
        break
      default:
        break
    }
  }
  return runs
}

/** Markdown → renderer-independent block IR via the markdown-it token stream. */
export function mdToIr(markdown: string): IrResult {
  // html: true so raw HTML arrives as html_inline/html_block tokens, which are
  // dropped with a warning (nothing is ever rendered — no XSS surface here).
  const md = new MarkdownIt({ html: true, linkify: true })
  const tokens = md.parse(markdown, {})
  const blocks: Block[] = []
  const warnings: string[] = []

  const listStack: { type: 'bullet' | 'ordered'; listId: number }[] = []
  /** Whether the current list item has already emitted its marker paragraph. */
  const itemFresh: boolean[] = []
  let quoteDepth = 0
  let olCounter = 0

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    switch (t.type) {
      case 'heading_open': {
        const level = Number(t.tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6
        blocks.push({ kind: 'heading', level, runs: inlineRuns(tokens[i + 1].children, warnings) })
        i += 2 // inline + heading_close
        break
      }
      case 'paragraph_open': {
        const runs = inlineRuns(tokens[i + 1].children, warnings)
        const top = listStack[listStack.length - 1]
        const fresh = itemFresh[itemFresh.length - 1]
        blocks.push({
          kind: 'paragraph',
          runs,
          ...(top && fresh
            ? { list: { type: top.type, level: listStack.length - 1, listId: top.listId } }
            : {}),
          ...(top && !fresh ? { indentLevel: listStack.length } : {}),
          ...(quoteDepth > 0 && { quote: true }),
        })
        if (itemFresh.length > 0) itemFresh[itemFresh.length - 1] = false
        i += 2
        break
      }
      case 'bullet_list_open':
        listStack.push({ type: 'bullet', listId: -1 })
        break
      case 'ordered_list_open':
        listStack.push({ type: 'ordered', listId: olCounter++ })
        break
      case 'bullet_list_close':
      case 'ordered_list_close':
        listStack.pop()
        break
      case 'list_item_open':
        itemFresh.push(true)
        break
      case 'list_item_close':
        itemFresh.pop()
        break
      case 'blockquote_open':
        quoteDepth++
        break
      case 'blockquote_close':
        quoteDepth--
        break
      case 'fence':
      case 'code_block':
        blocks.push({ kind: 'code', text: t.content.replace(/\n$/, ''), lang: t.info.trim() })
        break
      case 'hr':
        blocks.push({ kind: 'hr' })
        break
      case 'table_open': {
        const header: InlineRun[][] = []
        const rows: InlineRun[][][] = []
        let row: InlineRun[][] | null = null
        let inHead = false
        while (i < tokens.length && tokens[i].type !== 'table_close') {
          const tt = tokens[i]
          if (tt.type === 'thead_open') inHead = true
          else if (tt.type === 'thead_close') inHead = false
          else if (tt.type === 'tr_open') row = []
          else if (tt.type === 'tr_close') {
            if (row && !inHead) rows.push(row)
            row = null
          } else if (tt.type === 'th_open' || tt.type === 'td_open') {
            const cell = inlineRuns(tokens[i + 1].children, warnings)
            if (inHead) header.push(cell)
            else row?.push(cell)
            i += 2
          }
          i++
        }
        blocks.push({ kind: 'table', header, rows })
        break
      }
      case 'html_block':
        if (!warnings.includes('HTML blocks are not converted.'))
          warnings.push('HTML blocks are not converted.')
        break
      default:
        break
    }
  }
  return { blocks, warnings }
}
