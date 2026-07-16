import { describe, expect, it } from 'vitest'
import {
  MERMAID_BLOCK_CLASS,
  createEditorRenderer,
  diagramKey,
  injectMermaidDiagrams,
  renderMarkdown,
} from './preview'

describe('createEditorRenderer', () => {
  it('renders mermaid fences as escaped placeholder blocks', () => {
    const md = createEditorRenderer()
    const html = renderMarkdown(md, '```mermaid\nflowchart LR\n  A --> B\n```')
    expect(html).toContain(`class="${MERMAID_BLOCK_CLASS}"`)
    expect(html).toContain('A --&gt; B')
    expect(html).not.toContain('<svg')
  })

  it('leaves other fences to the normal pipeline', () => {
    const md = createEditorRenderer()
    const html = renderMarkdown(md, '```js\nlet x = 1\n```')
    expect(html).toContain('language-js')
    expect(html).not.toContain(MERMAID_BLOCK_CLASS)
  })

  it('keeps the Phase 4 XSS invariants', () => {
    const md = createEditorRenderer()
    expect(renderMarkdown(md, '<script>alert(1)</script>')).not.toContain('<script')
    expect(renderMarkdown(md, '<img src=x onerror=alert(1)>')).not.toContain('onerror')
    expect(renderMarkdown(md, '```mermaid\n</pre><script>alert(1)</script>\n```')).not.toContain(
      '<script',
    )
  })
})

describe('injectMermaidDiagrams', () => {
  const md = createEditorRenderer()
  const source = 'before\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nafter'

  it('reports found definitions and keeps placeholders without a cache entry', () => {
    const sanitized = renderMarkdown(md, source)
    const { html, codes } = injectMermaidDiagrams(sanitized, () => undefined)
    expect(codes).toEqual(['flowchart LR\n  A --> B\n'])
    expect(html).toContain(MERMAID_BLOCK_CLASS)
  })

  it('replaces placeholders with the cached SVG', () => {
    const sanitized = renderMarkdown(md, source)
    const { html } = injectMermaidDiagrams(sanitized, () => ({ svg: '<svg><g></g></svg>' }))
    expect(html).toContain('md-mermaid-diagram')
    expect(html).toContain('<svg>')
    expect(html).not.toContain(`class="${MERMAID_BLOCK_CLASS}"`)
    expect(html).toContain('before')
    expect(html).toContain('after')
  })

  it('annotates failed diagrams and keeps the source visible', () => {
    const sanitized = renderMarkdown(md, source)
    const { html } = injectMermaidDiagrams(sanitized, () => ({ error: 'Parse error on line 2' }))
    expect(html).toContain('md-mermaid-error')
    expect(html).toContain('Mermaid: Parse error on line 2')
    expect(html).toContain('A --&gt; B')
  })

  it('passes non-mermaid HTML through untouched', () => {
    const plain = renderMarkdown(md, '# just a title')
    expect(injectMermaidDiagrams(plain, () => undefined)).toEqual({ html: plain, codes: [] })
  })
})

describe('diagramKey', () => {
  it('separates themes for the same definition', () => {
    expect(diagramKey('a', true)).not.toBe(diagramKey('a', false))
  })
})
