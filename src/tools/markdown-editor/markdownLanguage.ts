import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { StateEffect } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

/** Markdown syntax colors via theme tokens — valid in both light and dark. */
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, color: 'var(--c-pine)' },
  { tag: tags.link, color: 'var(--c-pine)' },
  { tag: tags.url, color: 'var(--c-muted)' },
  { tag: tags.quote, color: 'var(--c-muted)', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: 'var(--c-faint)' },
  { tag: tags.labelName, color: 'var(--c-pine)' },
])

const markdownExtensions = [
  markdown({ base: markdownLanguage }),
  syntaxHighlighting(markdownHighlight),
]

/** Add syntax support without replacing the document, history or selection. */
export function enableMarkdown(view: EditorView) {
  view.dispatch({ effects: StateEffect.appendConfig.of(markdownExtensions) })
}
