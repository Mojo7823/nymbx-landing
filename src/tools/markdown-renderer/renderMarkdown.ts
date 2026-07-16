import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import { full as emoji } from 'markdown-it-emoji'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import ins from 'markdown-it-ins'
import mark from 'markdown-it-mark'
import footnote from 'markdown-it-footnote'
import deflist from 'markdown-it-deflist'
import abbr from 'markdown-it-abbr'
import container from 'markdown-it-container'
import DOMPurify from 'dompurify'

export type HighlightFn = (code: string, lang: string) => string

let hooksInstalled = false

/** External preview links open in a new tab; in-document anchors (footnotes) don't. */
function installSanitizeHooks() {
  if (hooksInstalled) return
  hooksInstalled = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      const href = node.getAttribute('href') ?? ''
      if (href.startsWith('#')) return
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

/**
 * markdown-it configured like the reference demo (markdown-it.github.io):
 * GFM tables/strikethrough, typographer replacements, and the standard
 * plugin set (task lists, emoji, sub/sup, ins, mark, footnotes, definition
 * lists, abbreviations, containers). Raw HTML is allowed *only* because
 * every render is passed through DOMPurify afterwards.
 */
export function createRenderer(highlight?: HighlightFn): MarkdownIt {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight: highlight
      ? (code, lang) => {
          try {
            return highlight(code, lang)
          } catch {
            return '' // fall back to markdown-it's escaped <pre><code>
          }
        }
      : undefined,
  })
  md.use(taskLists, { label: true })
  md.use(emoji)
  md.use(sub)
  md.use(sup)
  md.use(ins)
  md.use(mark)
  md.use(footnote)
  md.use(deflist)
  md.use(abbr)
  for (const name of ['warning', 'info', 'tip', 'note']) md.use(container, name)
  return md
}

/** Render markdown to sanitized HTML. Never throws on malformed input. */
export function renderMarkdown(md: MarkdownIt, source: string): string {
  installSanitizeHooks()
  let html: string
  try {
    html = md.render(source)
  } catch {
    // markdown-it should never throw; degrade to plain text if it does
    html = `<pre>${new MarkdownIt().utils.escapeHtml(source)}</pre>`
  }
  return DOMPurify.sanitize(html)
}
