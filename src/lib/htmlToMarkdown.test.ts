import { describe, expect, it } from 'vitest'
import DOMPurify from 'dompurify'
import {
  createTurndown,
  prepareDomForMarkdown,
  prepareTablesForMarkdown,
  resolveRelativeUrls,
  type TurndownOptions,
} from './htmlToMarkdown'

/** The real pipeline in miniature: sanitize → prepare DOM → turndown. */
async function toMarkdown(html: string, options: TurndownOptions = {}): Promise<string> {
  const body = DOMPurify.sanitize(html, {
    RETURN_DOM: true,
    FORBID_TAGS: ['style', 'noscript', 'template', 'svg', 'math'],
  }) as HTMLElement
  prepareDomForMarkdown(body, options)
  const turndown = await createTurndown(options)
  return turndown.turndown(body).trim()
}

describe('createTurndown options', () => {
  it('uses ATX headings by default and setext on request', async () => {
    expect(await toMarkdown('<h1>Title</h1><h2>Sub</h2>')).toBe('# Title\n\n## Sub')
    const setext = await toMarkdown('<h1>Title</h1><h2>Sub</h2>', { headingStyle: 'setext' })
    expect(setext).toContain('Title\n=====')
    expect(setext).toContain('Sub\n---')
  })

  it('honours the bullet list marker', async () => {
    expect(await toMarkdown('<ul><li>a</li><li>b</li></ul>')).toBe('-   a\n-   b')
    expect(await toMarkdown('<ul><li>a</li></ul>', { bulletListMarker: '*' })).toBe('*   a')
    expect(await toMarkdown('<ul><li>a</li></ul>', { bulletListMarker: '+' })).toBe('+   a')
  })

  it('honours the fence and emphasis delimiters', async () => {
    const html = '<pre><code>x</code></pre><p><em>i</em> <strong>b</strong></p>'
    expect(await toMarkdown(html)).toContain('```\nx\n```')
    expect(await toMarkdown(html)).toContain('_i_ **b**')
    expect(await toMarkdown(html, { fence: '~~~' })).toContain('~~~\nx\n~~~')
    expect(await toMarkdown(html, { emDelimiter: '*' })).toContain('*i* **b**')
  })

  it('keeps, flattens or drops images', async () => {
    const html = '<p><img src="a.png" alt="Alt text" title="T"></p>'
    expect(await toMarkdown(html)).toBe('![Alt text](a.png "T")')
    expect(await toMarkdown(html, { images: 'alt' })).toBe('Alt text')
    expect(await toMarkdown(html, { images: 'drop' })).toBe('')
  })

  it('keeps or unwraps links', async () => {
    const html = '<p><a href="https://example.com/x">label</a></p>'
    expect(await toMarkdown(html)).toBe('[label](https://example.com/x)')
    expect(await toMarkdown(html, { links: 'text' })).toBe('label')
  })

  it('keeps relative URLs verbatim unless a base URL is given', async () => {
    const html = '<p><a href="../rel/p.html">l</a> <img src="images/d.png" alt="d"></p>'
    expect(await toMarkdown(html)).toBe('[l](../rel/p.html) ![d](images/d.png)')
    expect(await toMarkdown(html, { baseUrl: 'https://example.com/docs/page.html' })).toBe(
      '[l](https://example.com/rel/p.html) ![d](https://example.com/docs/images/d.png)',
    )
  })

  it('drops page chrome unless skipChrome is off', async () => {
    const html =
      '<nav>Home</nav><header>Top</header><p>Body</p><aside>Ad</aside><footer>Bye</footer>'
    expect(await toMarkdown(html)).toBe('Body')
    const kept = await toMarkdown(html, { skipChrome: false })
    for (const word of ['Home', 'Top', 'Body', 'Ad', 'Bye']) expect(kept).toContain(word)
  })
})

describe('GFM conversion', () => {
  it('converts a table with a header row to a pipe table', async () => {
    const md = await toMarkdown(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    )
    expect(md).toContain('| A | B |')
    expect(md).toContain('| 1 | 2 |')
  })

  it('promotes the first row of a header-less table', async () => {
    const md = await toMarkdown(
      '<table><tr><td>Key</td><td>Value</td></tr><tr><td>t</td><td>30 s</td></tr></table>',
    )
    expect(md).toContain('| Key | Value |')
    expect(md).toContain('| t | 30 s |')
    expect(md).not.toContain('<table')
  })

  it('keeps a <br> inside a cell as a literal <br>', async () => {
    const md = await toMarkdown('<table><tr><th>H</th></tr><tr><td>Line<br>break</td></tr></table>')
    expect(md).toContain('Line<br>break')
  })

  it('converts three levels of nested lists', async () => {
    const md = await toMarkdown(
      '<ul><li>one<ul><li>two<ul><li>three</li></ul></li></ul></li></ul><ol><li>first</li><li>second</li></ol>',
    )
    expect(md).toContain('-   one')
    expect(md).toContain('    -   two')
    expect(md).toContain('        -   three')
    expect(md).toContain('1.  first')
    expect(md).toContain('2.  second')
  })

  it('takes the fence language from language- and lang- classes', async () => {
    expect(await toMarkdown('<pre><code class="language-ts">const a = 1</code></pre>')).toBe(
      '```ts\nconst a = 1\n```',
    )
    expect(await toMarkdown('<pre><code class="lang-bash">npm run build</code></pre>')).toBe(
      '```bash\nnpm run build\n```',
    )
    expect(await toMarkdown('<pre>plain text</pre>')).toContain('```\nplain text\n```')
  })

  it('converts inline formatting including strikethrough', async () => {
    const md = await toMarkdown(
      '<p><code>c</code> <strong>s</strong> <em>e</em> <del>d</del> <s>t</s></p>',
      { strikethrough: 'double' },
    )
    expect(md).toBe('`c` **s** _e_ ~~d~~ ~~t~~')
    // Default (Phase 14 compatibility) keeps turndown-plugin-gfm's single tilde.
    expect(await toMarkdown('<p><del>d</del></p>')).toBe('~d~')
  })

  it('converts task list checkboxes', async () => {
    const md = await toMarkdown(
      '<ul><li><input type="checkbox" checked disabled> Done</li><li><input type="checkbox" disabled> Open</li></ul>',
    )
    // turndown pads list markers to a 4-character indent (`-` + 3 spaces).
    expect(md).toContain('-   [x]  Done')
    expect(md).toContain('-   [ ]  Open')
  })
})

describe('safety and robustness', () => {
  it('never emits scripts, event handlers or javascript: URLs', async () => {
    const md = await toMarkdown(`<h1>XSS probe</h1>
<script>document.title='pwned'</script>
<img src="x" onerror="alert(1)" alt="img">
<a href="javascript:alert(2)">click me</a>
<a href="https://ok.example/" onclick="alert(3)">fine link</a>
<svg onload="alert(4)"><circle r="1"/></svg>
<iframe src="https://evil.example/"></iframe>
<p onmouseover="alert(6)">hover</p>
<p>Plain <b>bold</b> stays.</p>`)
    for (const bad of [
      '<script',
      'onerror',
      'onclick',
      'onmouseover',
      'onload',
      'javascript:',
      '<iframe',
    ]) {
      expect(md).not.toContain(bad)
    }
    expect(md).toContain('**bold**')
  })

  it('converts malformed HTML without throwing', async () => {
    const md = await toMarkdown(
      '<html><body><h1>Unclosed heading<p>Paragraph with <b>bold <i>and italic</b> mis-nested</i>\n<ul><li>one<li>two<li>three</ul><table><tr><td>a<td>b<tr><td>c</table>\n<div><span>never closed',
    )
    expect(md).toContain('Unclosed heading')
    for (const item of ['one', 'two', 'three', 'a', 'b', 'c']) expect(md).toContain(item)
  })
})

describe('prepareTablesForMarkdown', () => {
  it('returns prepared HTML for a string input', () => {
    const html = prepareTablesForMarkdown('<table><tr><td><p>a</p><p>b</p></td></tr></table>')
    expect(html).toContain('<th>a<br>b</th>')
  })

  it('edits a DOM root in place', () => {
    const doc = new DOMParser().parseFromString('<table><tr><td>x</td></tr></table>', 'text/html')
    prepareTablesForMarkdown(doc.body)
    expect(doc.body.querySelector('th')?.textContent).toBe('x')
  })
})

describe('resolveRelativeUrls', () => {
  it('leaves in-document anchors and absolute URLs alone', () => {
    const doc = new DOMParser().parseFromString(
      '<a href="#top">t</a><a href="mailto:hi@example.com">m</a><a href="/abs">a</a>',
      'text/html',
    )
    resolveRelativeUrls(doc.body, 'https://example.com/docs/page.html')
    const hrefs = [...doc.body.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['#top', 'mailto:hi@example.com', 'https://example.com/abs'])
  })
})

describe('escaping', () => {
  it('escapes a literal < so "<tag>" text is not read as HTML by renderers', async () => {
    const turndown = await createTurndown()
    expect(turndown.turndown('<p>use &lt;tag&gt; here</p>')).toBe('use \\<tag> here')
  })
})
