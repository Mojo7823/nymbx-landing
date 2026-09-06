import { describe, expect, it } from 'vitest'
import { categories, tools } from '../tools/registry'
import { searchTools, tokenize } from './toolSearch'

const slugs = (query: string) => searchTools(tools, query, categories).map((t) => t.slug)

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    expect(tokenize('  PDF   Merge ')).toEqual(['pdf', 'merge'])
    expect(tokenize('   ')).toEqual([])
  })
})

describe('searchTools', () => {
  it('returns the registry order for an empty query', () => {
    expect(searchTools(tools, '  ', categories)).toEqual(tools)
  })

  it('ranks the two hashers first for "hash"', () => {
    const result = slugs('hash')
    expect(result.slice(0, 2)).toEqual(['bulk-file-hasher', 'text-hasher'])
  })

  it('finds the spreadsheet viewer through a keyword for "excel"', () => {
    expect(slugs('excel')).toEqual(['xlsx-csv-viewer'])
  })

  it('ranks PDF merge first for the two-token query "pdf merge"', () => {
    expect(slugs('pdf merge')[0]).toBe('pdf-merge')
  })

  it('requires every token to match (AND)', () => {
    expect(slugs('pdf zzzz')).toEqual([])
    expect(slugs('zzzz')).toEqual([])
  })

  it('scores a name prefix above a description hit', () => {
    const result = slugs('mermaid')
    expect(result[0]).toBe('mermaid-editor')
  })

  it('matches a category name', () => {
    expect(slugs('security').length).toBeGreaterThan(3)
  })

  it('is case-insensitive', () => {
    expect(slugs('EXCEL')).toEqual(['xlsx-csv-viewer'])
  })
})
