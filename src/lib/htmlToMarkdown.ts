import type TurndownService from 'turndown'

/**
 * Shared turndown configuration used by the DOCX converter (Phase 14) and the
 * HTML → Markdown tool (Phase 53). `createTurndown({})` must keep producing
 * exactly the markdown Phase 14 produced before this module existed.
 *
 * turndown parses HTML with `DOMParser` / `document.implementation`, neither of
 * which exists in a Web Worker — everything here runs on the main thread.
 */
export interface TurndownOptions {
  /** `#` headings (default) or underlined setext headings. */
  headingStyle?: 'atx' | 'setext'
  /** Unordered list marker. Default `-`. */
  bulletListMarker?: '-' | '*' | '+'
  /** Fenced code block fence. Default ``` ``` ```. */
  fence?: '```' | '~~~'
  /** Emphasis delimiter. Default `_`. */
  emDelimiter?: '_' | '*'
  /** `keep` (default) writes `![alt](src)`, `alt` writes just the alt text, `drop` removes images. */
  images?: 'keep' | 'alt' | 'drop'
  /** `keep` (default) writes `[text](href)`, `text` unwraps the link to its text. */
  links?: 'keep' | 'text'
  /** When set, relative `href`/`src` are resolved against this URL. */
  baseUrl?: string
  /**
   * `double` emits GFM's `~~text~~`; `single` keeps turndown-plugin-gfm's
   * `~text~`. Default `single` so the Phase 14 DOCX converter's output is
   * unchanged by this refactor.
   */
  strikethrough?: 'single' | 'double'
  /** Drop `nav`, `header`, `footer` and `aside`. Default `true`. */
  skipChrome?: boolean
}

/** Elements that never carry meaningful markdown content. */
const ALWAYS_REMOVED = ['script', 'style', 'noscript', 'template'] as const

/** Page furniture dropped when `skipChrome` is on. */
const CHROME_TAGS = ['nav', 'header', 'footer', 'aside'] as const

function ownerDocumentOf(root: ParentNode): Document {
  if (root.nodeType === Node.DOCUMENT_NODE) return root as Document
  return (root as Element).ownerDocument
}

/**
 * mammoth (and many saved pages) emit tables as plain `<td>` rows with a `<p>`
 * per cell, which turndown-plugin-gfm keeps as raw HTML (it needs a `<th>`
 * header row) and whose block children would break pipe rows. Flatten cell
 * paragraphs to `<br>`-separated inline content and promote the first row to
 * `<th>`. Only for the markdown pipeline; HTML output stays untouched.
 *
 * Given a string, returns the prepared HTML; given a DOM root, edits in place.
 */
export function prepareTablesForMarkdown(html: string): string
export function prepareTablesForMarkdown(root: ParentNode): void
export function prepareTablesForMarkdown(input: string | ParentNode): string | void {
  if (typeof input === 'string') {
    const doc = new DOMParser().parseFromString(input, 'text/html')
    prepareTablesForMarkdown(doc.body)
    return doc.body.innerHTML
  }

  const doc = ownerDocumentOf(input)
  for (const cell of input.querySelectorAll('td, th')) {
    const children = Array.from(cell.children)
    if (children.length > 0 && children.every((c) => c.tagName === 'P')) {
      cell.innerHTML = children.map((c) => c.innerHTML).join('<br>')
    }
  }
  for (const table of input.querySelectorAll<HTMLTableElement>('table')) {
    if (table.querySelector('th')) continue
    const firstRow = table.rows[0]
    if (!firstRow) continue
    for (const td of Array.from(firstRow.cells)) {
      const th = doc.createElement('th')
      th.innerHTML = td.innerHTML
      td.replaceWith(th)
    }
  }
}

/** Resolve relative `href`/`src` against `baseUrl`, in place. Invalid URLs are left alone. */
export function resolveRelativeUrls(root: ParentNode, baseUrl: string): void {
  const rewrite = (el: Element, attr: string) => {
    const value = el.getAttribute(attr)
    if (!value || value.startsWith('#')) return
    try {
      el.setAttribute(attr, new URL(value, baseUrl).href)
    } catch {
      // Not resolvable (e.g. an unsupported scheme) — keep the original.
    }
  }
  for (const a of root.querySelectorAll('a[href]')) rewrite(a, 'href')
  for (const img of root.querySelectorAll('img[src]')) rewrite(img, 'src')
}

/**
 * Prepare a sanitized DOM for conversion: drop page chrome, resolve relative
 * URLs against `baseUrl`, then fix up tables. Edits `root` in place.
 */
export function prepareDomForMarkdown(root: ParentNode, options: TurndownOptions = {}): void {
  const tags = [...ALWAYS_REMOVED, ...(options.skipChrome === false ? [] : CHROME_TAGS)]
  for (const el of root.querySelectorAll(tags.join(','))) el.remove()
  if (options.baseUrl) resolveRelativeUrls(root, options.baseUrl)
  prepareTablesForMarkdown(root)
}

/**
 * A turndown instance configured for GFM output. Rules beyond the Phase 14
 * baseline are only registered when the corresponding option deviates from its
 * default, so `createTurndown({})` is byte-identical to the original setup.
 */
export async function createTurndown(options: TurndownOptions = {}): Promise<TurndownService> {
  const [{ default: TurndownService }, { gfm }] = await Promise.all([
    import('turndown'),
    import('turndown-plugin-gfm'),
  ])

  const turndown = new TurndownService({
    headingStyle: options.headingStyle ?? 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: options.bulletListMarker ?? '-',
    fence: options.fence ?? '```',
    emDelimiter: options.emDelimiter ?? '_',
    hr: '---',
    linkStyle: 'inlined',
  })
  turndown.use(gfm)

  // GFM table cells are single-line; a literal <br> is the standard way to
  // keep an in-cell line break instead of turndown's "  \n" (breaks the row).
  turndown.addRule('cellLineBreak', {
    filter: (node) => node.nodeName === 'BR' && node.parentElement?.closest('td, th') != null,
    replacement: () => '<br>',
  })

  // turndown only reads `language-xxx`; GitHub and many highlighters also
  // emit `lang-xxx`. Same body as turndown's fencedCodeBlock rule otherwise.
  turndown.addRule('fencedCodeBlockWithLang', {
    filter: (node, opts) =>
      opts.codeBlockStyle === 'fenced' &&
      node.nodeName === 'PRE' &&
      node.firstChild != null &&
      node.firstChild.nodeName === 'CODE',
    replacement: (_content, node, opts) => {
      const code = node.firstChild as Element
      const className = code.getAttribute('class') ?? ''
      const language = /(?:language|lang)-(\S+)/.exec(className)?.[1] ?? ''
      const text = code.textContent ?? ''
      const fenceChar = (opts.fence ?? '```').charAt(0)
      let fenceSize = 3
      for (const match of text.matchAll(new RegExp(`^${fenceChar}{3,}`, 'gm'))) {
        fenceSize = Math.max(fenceSize, match[0].length + 1)
      }
      const fence = fenceChar.repeat(fenceSize)
      return `\n\n${fence}${language}\n${text.replace(/\n$/, '')}\n${fence}\n\n`
    },
  })

  // A <pre> without a <code> child has no rule in turndown and would lose its
  // formatting; emit it as a plain fence.
  turndown.addRule('bareFencedCodeBlock', {
    filter: (node, opts) =>
      opts.codeBlockStyle === 'fenced' &&
      node.nodeName === 'PRE' &&
      node.firstChild?.nodeName !== 'CODE',
    replacement: (_content, node, opts) => {
      const fence = (opts.fence ?? '```').charAt(0).repeat(3)
      return `\n\n${fence}\n${(node.textContent ?? '').replace(/\n$/, '')}\n${fence}\n\n`
    },
  })

  if (options.strikethrough === 'double') {
    turndown.addRule('gfmStrikethrough', {
      filter: (node) => ['DEL', 'S', 'STRIKE'].includes(node.nodeName),
      replacement: (content) => `~~${content}~~`,
    })
  }

  if (options.images === 'alt') {
    turndown.addRule('imageAltOnly', {
      filter: 'img',
      replacement: (_content, node) => (node as Element).getAttribute('alt') ?? '',
    })
  } else if (options.images === 'drop') {
    turndown.addRule('imageDrop', { filter: 'img', replacement: () => '' })
  }

  if (options.links === 'text') {
    turndown.addRule('linkTextOnly', { filter: 'a', replacement: (content) => content })
  }

  turndown.remove([...ALWAYS_REMOVED])
  if (options.skipChrome !== false) turndown.remove([...CHROME_TAGS])

  // turndown's escape table has no rule for `<`, so literal "<tag>" text in
  // the source came out bare and was then read as HTML by Markdown renderers
  // (and dropped by their sanitizers). Escape it like the other specials.
  const escape = turndown.escape.bind(turndown)
  turndown.escape = (text: string) => escape(text).replace(/</g, '\\<')

  return turndown
}
