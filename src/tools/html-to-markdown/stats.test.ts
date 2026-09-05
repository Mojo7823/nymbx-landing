import { describe, expect, it } from 'vitest'
import { byteLength, countDomStats, formatStatsLine } from './stats'

function bodyOf(html: string): HTMLElement {
  return new DOMParser().parseFromString(html, 'text/html').body
}

describe('countDomStats', () => {
  it('counts tables, images and links', () => {
    expect(
      countDomStats(
        bodyOf(
          '<table><tr><td>1</td></tr></table><table></table><img src="a.png"><p><a href="/x">x</a><a>no href</a></p>',
        ),
      ),
    ).toEqual({ tables: 2, images: 1, links: 1 })
  })

  it('returns zeros for plain text', () => {
    expect(countDomStats(bodyOf('<p>hello</p>'))).toEqual({ tables: 0, images: 0, links: 0 })
  })
})

describe('byteLength', () => {
  it('measures UTF-8 bytes, not code units', () => {
    expect(byteLength('abc')).toBe(3)
    expect(byteLength('繁體')).toBe(6)
    expect(byteLength('🎉')).toBe(4)
  })
})

describe('formatStatsLine', () => {
  it('formats sizes and non-zero counts', () => {
    expect(formatStatsLine(12_700, 3_200, { tables: 3, images: 2, links: 14 })).toBe(
      '12.4 KB HTML → 3.1 KB Markdown · 3 tables · 2 images · 14 links',
    )
  })

  it('singularizes and omits empty counts', () => {
    expect(formatStatsLine(100, 40, { tables: 1, images: 0, links: 0 })).toBe(
      '100 B HTML → 40 B Markdown · 1 table',
    )
    expect(formatStatsLine(100, 40, { tables: 0, images: 0, links: 0 })).toBe(
      '100 B HTML → 40 B Markdown',
    )
  })
})
