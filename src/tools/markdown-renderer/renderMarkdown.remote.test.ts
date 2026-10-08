import { beforeAll, describe, expect, it } from 'vitest'
import type MarkdownIt from 'markdown-it'
import { createRenderer, renderMarkdown } from './renderMarkdown'

const REMOTE = 'https://tracker.example'

let md: MarkdownIt

beforeAll(() => {
  md = createRenderer()
})

const FETCHING_TAGS: Record<string, true> = {
  style: true,
  link: true,
  iframe: true,
  object: true,
  embed: true,
  picture: true,
  source: true,
  video: true,
  audio: true,
  track: true,
  base: true,
  meta: true,
  image: true,
  feimage: true,
}

const LOADING_ATTRS: Record<string, true> = {
  src: true,
  srcset: true,
  poster: true,
  background: true,
  data: true,
  href: true,
}

/** Everything in the rendered preview that the browser would request on insert. */
function requestsFrom(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const found: string[] = []
  for (const el of doc.body.querySelectorAll('*')) {
    const tag = el.localName.toLowerCase()
    if (FETCHING_TAGS[tag] === true) found.push(tag)
    for (const attr of el.attributes) {
      if (attr.name === 'style' && /url\(|@import/i.test(attr.value)) found.push(`${tag}[style]`)
      // Plain links only navigate when clicked, so they are not requests.
      if (tag === 'a') continue
      if (LOADING_ATTRS[attr.name] === true && !attr.value.startsWith('data:')) {
        found.push(`${tag}[${attr.name}]`)
      }
    }
  }
  return found
}

const VECTORS: Record<string, string> = {
  'markdown image': `![pixel](${REMOTE}/a.gif)`,
  'linked markdown image': `[![logo](${REMOTE}/logo.png)](${REMOTE}/page)`,
  'raw img': `<img src="${REMOTE}/b.png" alt="b">`,
  'img with srcset': `<img src="data:image/gif;base64,R0lGOD" srcset="${REMOTE}/c.png 1x">`,
  'picture and source': `<picture><source srcset="${REMOTE}/d.png"><img src="data:image/gif;base64,R0lGOD"></picture>`,
  'svg image': `<svg><image href="${REMOTE}/e.png"/></svg>`,
  'svg feImage': `<svg><filter><feImage href="${REMOTE}/f.png"/></filter></svg>`,
  'inline style url()': `<div style="background-image:url(${REMOTE}/g.png)">x</div>`,
  'style element': `<style>@import url(${REMOTE}/h.css);</style><p>x</p>`,
  'video poster and src': `<video poster="${REMOTE}/i.png" src="${REMOTE}/i.mp4"></video>`,
  'audio src': `<audio src="${REMOTE}/j.mp3"></audio>`,
  'input type=image': `<input type="image" src="${REMOTE}/k.png">`,
  'table background': `<table background="${REMOTE}/l.png"><tr><td>x</td></tr></table>`,
  'stylesheet link': `<link rel="stylesheet" href="${REMOTE}/m.css">`,
  'object, embed, iframe': `<object data="${REMOTE}/n.svg"></object><embed src="${REMOTE}/o.pdf"><iframe src="${REMOTE}/p"></iframe>`,
  'relative image': '![rel](/relative.png)',
}

describe('renderMarkdown — preview requests nothing from the document', () => {
  for (const [name, source] of Object.entries(VECTORS)) {
    it(`neutralizes ${name}`, () => {
      expect(requestsFrom(renderMarkdown(md, source))).toEqual([])
    })
  }
})

describe('renderMarkdown — remote images become labelled chips', () => {
  it('names the image by its alt text and keeps the URL as a tooltip', () => {
    const html = renderMarkdown(md, `![Quarterly chart](${REMOTE}/chart.png)`)
    expect(html).not.toContain('<img')
    expect(html).toContain('image: Quarterly chart')
    expect(html).toContain(`title="${REMOTE}/chart.png"`)
  })

  it('names a chip by its URL when there is no alt text', () => {
    const html = renderMarkdown(md, `![](${REMOTE}/chart.png)`)
    expect(html).toContain(`image: ${REMOTE}/chart.png`)
  })

  it('keeps the link around a remote image', () => {
    const html = renderMarkdown(md, `[![logo](${REMOTE}/logo.png)](${REMOTE}/page)`)
    expect(html).toContain(`href="${REMOTE}/page"`)
    expect(html).toContain('image: logo')
  })
})

describe('renderMarkdown — embedded data: images still render', () => {
  it('keeps data: images as <img> elements', () => {
    const html = renderMarkdown(md, '![dot](data:image/gif;base64,R0lGOD)')
    expect(html).toMatch(/<img [^>]*src="data:image\/gif;base64,R0lGOD"/)
  })
})
