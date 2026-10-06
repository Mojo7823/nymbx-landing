import type { HighlighterCore } from 'shiki/core'

// Keep the existing language set, but fetch a grammar only when a fence uses it.
// Each grammar module includes its own embedded-language dependencies.
const languageLoaders = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  shellscript: () => import('shiki/langs/bash.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  'cpp-macro': () => import('shiki/langs/cpp-macro.mjs'),
  regexp: () => import('shiki/langs/regexp.mjs'),
  glsl: () => import('shiki/langs/glsl.mjs'),
}

type Language = keyof typeof languageLoaders

const aliases: Readonly<Record<string, Language>> = {
  js: 'javascript',
  cjs: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  cts: 'typescript',
  mts: 'typescript',
  py: 'python',
  bash: 'shellscript',
  sh: 'shellscript',
  shell: 'shellscript',
  zsh: 'shellscript',
  md: 'markdown',
  yml: 'yaml',
  rs: 'rust',
  'c++': 'cpp',
  regex: 'regexp',
}

/** Unknown languages (including Mermaid) never start the syntax highlighter. */
export function highlightLanguage(lang: string): Language | undefined {
  const name = lang.toLowerCase()
  if (Object.hasOwn(languageLoaders, name)) return name as Language
  return Object.hasOwn(aliases, name) ? aliases[name] : undefined
}

let highlighterPromise: Promise<HighlighterCore> | null = null
const languagePromises = new Map<Language, Promise<void>>()

/** Lazy core and two used themes, without Shiki's complete bundle inventories. */
export async function loadHighlighter(languages: readonly string[]): Promise<HighlighterCore> {
  highlighterPromise ??= Promise.all([import('shiki/core'), import('shiki/engine/oniguruma')]).then(
    ([{ createHighlighterCore }, { createOnigurumaEngine }]) =>
      createHighlighterCore({
        themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
        langs: [],
        engine: createOnigurumaEngine(import('shiki/wasm')),
      }),
  )
  const highlighter = await highlighterPromise
  await Promise.all(
    languages.map((lang) => {
      const name = highlightLanguage(lang)
      if (!name || highlighter.getLoadedLanguages().includes(name)) return
      let pending = languagePromises.get(name)
      if (!pending) {
        pending = highlighter.loadLanguage(languageLoaders[name]())
        languagePromises.set(name, pending)
      }
      return pending
    }),
  )
  return highlighter
}

/** Dual-theme output; missing grammars remain plain escaped code while loading. */
export function highlightCode(highlighter: HighlighterCore, code: string, lang: string): string {
  const name = highlightLanguage(lang)
  if (!name || !highlighter.getLoadedLanguages().includes(name)) return ''
  return highlighter.codeToHtml(code, {
    lang: name,
    themes: { light: 'github-light', dark: 'github-dark' },
    defaultColor: 'light',
  })
}
