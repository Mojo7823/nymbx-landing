import { describe, expect, it } from 'vitest'
import { categories, getTool, tools } from '../tools/registry'

describe('tool registry', () => {
  it('has unique route slugs', () => {
    const slugs = new Set(tools.map((t) => t.slug))
    expect(slugs.size).toBe(tools.length)
  })

  it('marks exactly one tool as server-assisted (DOCX ↔ PDF)', () => {
    const serverAssisted = tools.filter((t) => t.badge === 'server-assisted')
    expect(serverAssisted).toHaveLength(1)
    expect(serverAssisted[0]!.slug).toBe('docx-pdf')
  })

  it('only references declared categories', () => {
    const ids = new Set(categories.map((c) => c.id))
    expect(tools.every((t) => ids.has(t.category))).toBe(true)
  })

  it('gives every tool 2–6 unique lowercase keywords that are not other slugs', () => {
    const slugs = new Set(tools.map((t) => t.slug))
    for (const tool of tools) {
      expect(tool.keywords.length, tool.slug).toBeGreaterThanOrEqual(2)
      expect(tool.keywords.length, tool.slug).toBeLessThanOrEqual(6)
      expect(new Set(tool.keywords).size, tool.slug).toBe(tool.keywords.length)
      for (const keyword of tool.keywords) {
        expect(keyword, tool.slug).toBe(keyword.toLowerCase())
        expect(keyword.trim(), tool.slug).toBe(keyword)
        // A keyword that is another tool's slug would pull the wrong card up.
        expect(slugs.has(keyword) && keyword !== tool.slug, `${tool.slug}: ${keyword}`).toBe(false)
      }
    }
  })

  it('looks up tools by slug', () => {
    expect(getTool('diff-checker')?.name).toBe('Diff checker')
    expect(getTool('nope')).toBeUndefined()
  })
})
