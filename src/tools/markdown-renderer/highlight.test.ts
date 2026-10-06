import { describe, expect, it } from 'vitest'
import { highlightCode, loadHighlighter } from './highlight'

describe('loadHighlighter', () => {
  it('keeps unsupported code escaped and highlights concurrent later additions in both themes', async () => {
    const highlighter = await loadHighlighter(['ts', 'typescript'])
    expect(highlightCode(highlighter, 'print(1)', 'python')).toBe('')
    expect(highlightCode(highlighter, '<script>alert(1)</script>', 'unknown')).toBe('')

    const [next] = await Promise.all([loadHighlighter(['py']), loadHighlighter(['python'])])
    const html = highlightCode(next, 'print("<script>")', 'py')
    expect(html).toContain('shiki')
    expect(html).toContain('--shiki-dark')
    expect(html).not.toContain('<script>')
  })
})
