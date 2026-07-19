import { describe, expect, it } from 'vitest'
import { categories, getTool, tools } from '../tools/registry'

describe('tool registry', () => {
  it('contains all 52 tools across 7 categories', () => {
    expect(tools).toHaveLength(52)
    expect(categories).toHaveLength(7)
  })

  it('has unique slugs and phase numbers covering 1–52', () => {
    const slugs = new Set(tools.map((t) => t.slug))
    expect(slugs.size).toBe(52)
    const phases = tools.map((t) => t.phase).sort((a, b) => a - b)
    expect(phases).toEqual(Array.from({ length: 52 }, (_, i) => i + 1))
  })

  it('marks exactly one tool as server-assisted (DOCX ↔ PDF)', () => {
    const serverAssisted = tools.filter((t) => t.badge === 'server-assisted')
    expect(serverAssisted).toHaveLength(1)
    expect(serverAssisted[0]!.slug).toBe('docx-pdf')
  })

  it('marks built tools as available and the rest as coming-soon', () => {
    const available = tools.filter((t) => t.status === 'available').map((t) => t.slug)
    expect(available).toEqual([
      'em-dash-remover',
      'double-line-remover',
      'diff-checker',
      'markdown-renderer',
      'mermaid-editor',
      'markdown-editor',
      'image-resize',
      'background-remover',
      'bulk-file-hasher',
      'bulk-file-renamer',
      'pdf-split',
      'pdf-resize',
      'pdf-to-image-markdown',
      'pdf-merge',
      'pdf-page-organizer',
      'pdf-watermark',
      'images-to-pdf',
      'pdf-compress',
      'xlsx-csv-viewer',
      'docx-to-html-markdown',
      'docx-pdf',
      'markdown-to-docx',
      'json-formatter',
      'yaml-json-toml',
    ])
    expect(tools.every((t) => t.status === 'available' || t.status === 'coming-soon')).toBe(true)
  })

  it('only references declared categories', () => {
    const ids = new Set(categories.map((c) => c.id))
    expect(tools.every((t) => ids.has(t.category))).toBe(true)
  })

  it('looks up tools by slug', () => {
    expect(getTool('diff-checker')?.name).toBe('Diff checker')
    expect(getTool('nope')).toBeUndefined()
  })
})
