import { describe, expect, it } from 'vitest'
import { createTurndown, prepareDomForMarkdown } from '../../lib/htmlToMarkdown'
import {
  BATCH_SIZE,
  ConvertCancelled,
  convertHtml,
  groupTopLevelNodes,
  htmlToMarkdown,
  normalizeMarkdown,
  sanitizeHtml,
} from './convert'

/** A mixed document with comfortably more top-level nodes than one batch. */
function bigDocument(): string {
  const parts: string[] = ['<h1>Report</h1>']
  for (let i = 0; i < BATCH_SIZE * 2 + 37; i++) {
    if (i % 50 === 0) parts.push(`<h2>Section ${i}</h2>`)
    if (i % 37 === 0) parts.push('<ul><li>alpha<ul><li>beta</li></ul></li><li>gamma</li></ul>')
    if (i % 73 === 0) {
      parts.push('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>')
    }
    parts.push(`<p>Paragraph <strong>${i}</strong> with a <a href="/x${i}">link</a>.</p>`)
  }
  return parts.join('')
}

/** Same pipeline, but converting the whole body in one turndown call. */
async function unbatched(html: string): Promise<string> {
  const body = sanitizeHtml(html)
  prepareDomForMarkdown(body)
  const turndown = await createTurndown()
  return normalizeMarkdown(turndown.turndown(body))
}

describe('groupTopLevelNodes', () => {
  it('splits only before block-level nodes', () => {
    const doc = new DOMParser().parseFromString('<body></body>', 'text/html')
    const nodes: Node[] = []
    for (let i = 0; i < 5; i++) nodes.push(doc.createElement('p'))
    // A run of inline/text nodes that must not be cut.
    for (let i = 0; i < 4; i++) nodes.push(doc.createTextNode(`t${i}`), doc.createElement('em'))
    nodes.push(doc.createElement('p'))

    const batches = groupTopLevelNodes(nodes, 3)
    expect(batches.flat()).toEqual(nodes)
    for (const batch of batches) {
      // Every batch after the first starts on a block node.
      expect(batch[0]!.nodeName).toMatch(/^(P|EM|#text)$/)
    }
    expect(batches.slice(1).every((b) => b[0]!.nodeName === 'P')).toBe(true)
    // The 8-node inline run keeps its batch oversized rather than splitting.
    expect(batches.some((b) => b.length > 3)).toBe(true)
  })

  it('returns no batches for an empty node list', () => {
    expect(groupTopLevelNodes([])).toEqual([])
  })
})

describe('convertHtml', () => {
  it('matches the unbatched conversion of the same document', async () => {
    const html = bigDocument()
    const batched = await htmlToMarkdown(html)
    expect(batched).toBe(await unbatched(html))
    expect(batched).toContain('# Report')
    expect(batched).toContain('| A | B |')
  })

  it('reports monotonic progress that reaches the total', async () => {
    const seen: { done: number; total: number }[] = []
    await htmlToMarkdown(bigDocument(), {}, (p) => seen.push(p))
    expect(seen.length).toBeGreaterThan(1)
    expect(seen.every((p, i) => p.done === i + 1)).toBe(true)
    expect(seen.at(-1)!.done).toBe(seen[0]!.total)
  })

  it('rejects with ConvertCancelled when the signal aborts', async () => {
    const controller = new AbortController()
    await expect(
      htmlToMarkdown(bigDocument(), {}, () => controller.abort(), controller.signal),
    ).rejects.toBeInstanceOf(ConvertCancelled)
  })

  it('counts tables, images and links on the sanitized DOM', async () => {
    const { counts, markdown } = await convertHtml(
      '<p><a href="/a">a</a> <a href="/b">b</a> <img src="i.png" alt="i"></p>' +
        '<table><tr><th>H</th></tr></table><script>bad()</script>',
    )
    expect(counts).toEqual({ tables: 1, images: 1, links: 2 })
    expect(markdown).not.toContain('bad()')
  })

  it('returns an empty string for empty input', async () => {
    expect(await htmlToMarkdown('')).toBe('')
    expect(await htmlToMarkdown('   ')).toBe('')
  })
})

describe('normalizeMarkdown', () => {
  it('collapses blank-line runs and trims', () => {
    expect(normalizeMarkdown('\n\na\n\n\n\n\nb\n\n')).toBe('a\n\nb')
  })
})
