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
  // Only <img> may carry a src, and neutralizeImages replaces it before display.
  // Any other element with a src (e.g. <input type="image">) would fetch it.
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'src' && node.nodeName !== 'IMG') data.keepAttr = false
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

/**
 * Markup that makes the browser fetch a URL, or restyle the page from one, as
 * soon as the preview is inserted. Markdown never needs any of it, so it is
 * removed outright.
 */
const SANITIZE_CONFIG = {
  FORBID_TAGS: [
    'style',
    'link',
    'base',
    'meta',
    'iframe',
    'object',
    'embed',
    'picture',
    'source',
    'video',
    'audio',
    'track',
    'image',
    'feimage',
  ],
  FORBID_ATTR: ['srcset', 'poster', 'background', 'style'],
}

/** Class for the chip that stands in for a remote image. */
const IMAGE_CHIP_CLASS =
  'inline-flex max-w-full items-baseline gap-1 truncate rounded border border-line-strong bg-soft px-1.5 py-0.5 font-mono text-[11px] text-muted'

/**
 * The preview must not reach the network: an `<img>` pointing at another host
 * would tell that host the user is reading this document. Every non-`data:`
 * image becomes a chip naming it, with the URL as its tooltip. Input is
 * DOMPurify output, so re-serializing it introduces nothing.
 */
function neutralizeImages(sanitized: string): string {
  if (!sanitized.includes('<img')) return sanitized
  const doc = new DOMParser().parseFromString(sanitized, 'text/html')
  for (const img of doc.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? ''
    if (src.startsWith('data:')) continue
    const chip = doc.createElement('span')
    chip.className = IMAGE_CHIP_CLASS
    chip.textContent = `image: ${img.getAttribute('alt') || src}`
    chip.title = src
    img.replaceWith(chip)
  }
  return doc.body.innerHTML
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
  return neutralizeImages(DOMPurify.sanitize(html, SANITIZE_CONFIG))
}
