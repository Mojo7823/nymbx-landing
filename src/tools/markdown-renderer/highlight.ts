import type { Highlighter } from 'shiki'

/** Languages preloaded with the highlighter; others render unhighlighted. */
export const PRELOADED_LANGS = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'python',
  'json',
  'html',
  'css',
  'bash',
  'sql',
  'markdown',
  'yaml',
  'toml',
  'diff',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
]

let highlighterPromise: Promise<Highlighter> | null = null

/** Lazy shiki singleton — the library only loads when a render needs it. */
export function loadHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= import('shiki').then((shiki) =>
    shiki.createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: PRELOADED_LANGS,
    }),
  )
  return highlighterPromise
}

/**
 * Dual-theme highlight; returns '' for unknown languages so markdown-it
 * falls back to a plain escaped code block.
 */
export function highlightCode(highlighter: Highlighter, code: string, lang: string): string {
  const name = lang.toLowerCase()
  if (!highlighter.getLoadedLanguages().includes(name)) return ''
  return highlighter.codeToHtml(code, {
    lang: name,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: 'light',
  })
}
