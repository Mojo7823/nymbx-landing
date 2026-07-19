import { describe, expect, it } from 'vitest'
import { mdToIr, type Block } from './mdToIr'

function blocks(md: string): Block[] {
  return mdToIr(md).blocks
}

describe('mdToIr', () => {
  it('maps heading levels', () => {
    expect(blocks('# One\n\n### Three')).toEqual([
      { kind: 'heading', level: 1, runs: [{ text: 'One' }] },
      { kind: 'heading', level: 3, runs: [{ text: 'Three' }] },
    ])
  })

  it('captures inline formatting with nesting', () => {
    const [p] = blocks('plain **bold _both_** ~~gone~~ `x=1`')
    expect(p).toEqual({
      kind: 'paragraph',
      runs: [
        { text: 'plain ' },
        { text: 'bold ', bold: true },
        { text: 'both', bold: true, italic: true },
        { text: ' ' },
        { text: 'gone', strike: true },
        { text: ' ' },
        { text: 'x=1', code: true },
      ],
    })
  })

  it('attaches hrefs to link runs', () => {
    const [p] = blocks('see [the docs](https://example.com) now')
    expect(p.kind === 'paragraph' && p.runs[1]).toEqual({
      text: 'the docs',
      link: 'https://example.com',
    })
  })

  it('captures images with src and alt', () => {
    const [p] = blocks('![logo](data:image/png;base64,AAAA)')
    expect(p.kind === 'paragraph' && p.runs[0]).toEqual({
      image: { src: 'data:image/png;base64,AAAA', alt: 'logo' },
    })
  })

  it('tracks nested list levels and types', () => {
    const out = blocks('- a\n  1. b\n  2. c\n- d')
    expect(out.map((b) => b.kind === 'paragraph' && b.list)).toEqual([
      { type: 'bullet', level: 0, listId: -1 },
      { type: 'ordered', level: 1, listId: 0 },
      { type: 'ordered', level: 1, listId: 0 },
      { type: 'bullet', level: 0, listId: -1 },
    ])
  })

  it('gives separate ordered lists distinct ids so numbering restarts', () => {
    const out = blocks('1. a\n\ntext\n\n1. b')
    const ids = out
      .filter((b) => b.kind === 'paragraph' && b.list?.type === 'ordered')
      .map((b) => b.kind === 'paragraph' && b.list?.listId)
    expect(ids).toEqual([0, 1])
  })

  it('marks continuation paragraphs in a list item as indent-only', () => {
    const out = blocks('- first\n\n  second paragraph\n')
    expect(out[0].kind === 'paragraph' && out[0].list?.type).toBe('bullet')
    expect(out[1]).toMatchObject({ kind: 'paragraph', indentLevel: 1 })
    expect(out[1].kind === 'paragraph' && out[1].list).toBeUndefined()
  })

  it('flags blockquote paragraphs', () => {
    expect(blocks('> quoted')[0]).toMatchObject({ kind: 'paragraph', quote: true })
  })

  it('extracts fenced code with language', () => {
    expect(blocks('```js\nconst a = 1\nconst b = 2\n```')).toEqual([
      { kind: 'code', text: 'const a = 1\nconst b = 2', lang: 'js' },
    ])
  })

  it('parses tables into header and body cells', () => {
    const [t] = blocks('| A | B |\n| --- | --- |\n| 1 | **2** |')
    expect(t).toEqual({
      kind: 'table',
      header: [[{ text: 'A' }], [{ text: 'B' }]],
      rows: [[[{ text: '1' }], [{ text: '2', bold: true }]]],
    })
  })

  it('emits hr blocks', () => {
    expect(blocks('---')).toEqual([{ kind: 'hr' }])
  })

  it('turns hard breaks into break runs', () => {
    const [p] = blocks('line one  \nline two')
    expect(p.kind === 'paragraph' && p.runs).toEqual([
      { text: 'line one' },
      { break: true },
      { text: 'line two' },
    ])
  })

  it('warns on raw HTML instead of converting it', () => {
    const { warnings } = mdToIr('text with <span>html</span>\n\n<div>block</div>')
    expect(warnings).toContain('Inline HTML is not converted.')
    expect(warnings).toContain('HTML blocks are not converted.')
  })
})
