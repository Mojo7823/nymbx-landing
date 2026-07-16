import { describe, expect, it } from 'vitest'
import { buildRenamePlan, defaultOptions, type RenameOptions } from './renameLogic'

function opts(partial: Partial<RenameOptions> = {}): RenameOptions {
  return { ...defaultOptions, ...partial }
}

describe('buildRenamePlan — find/replace', () => {
  it('replaces every occurrence of a plain-text find', () => {
    const plan = buildRenamePlan(['a_b_a.txt'], opts({ find: 'a', replace: 'x' }))
    expect(plan.rows[0].newName).toBe('x_b_x.txt')
  })

  it('leaves the extension untouched by find/replace', () => {
    const plan = buildRenamePlan(['note.txt'], opts({ find: 't', replace: 'X' }))
    expect(plan.rows[0].newName).toBe('noXe.txt')
  })

  it('treats plain-text find literally, not as regex', () => {
    const plan = buildRenamePlan(['a.b.c.txt'], opts({ find: '.', replace: '-' }))
    expect(plan.rows[0].newName).toBe('a-b-c.txt')
  })

  it('supports regex with capture groups', () => {
    const plan = buildRenamePlan(
      ['IMG_2024_holiday.jpg'],
      opts({ find: String.raw`IMG_(\d+)_(.+)`, replace: '$2-$1', useRegex: true }),
    )
    expect(plan.rows[0].newName).toBe('holiday-2024.jpg')
  })

  it('reports an invalid regex instead of throwing, and blocks export', () => {
    const plan = buildRenamePlan(['a.txt'], opts({ find: '(', useRegex: true }))
    expect(plan.error).toMatch(/regex/i)
    expect(plan.hasBlocking).toBe(true)
  })

  it('empty find leaves names unchanged', () => {
    const plan = buildRenamePlan(['a.txt'], opts({ find: '', replace: 'x' }))
    expect(plan.rows[0].newName).toBe('a.txt')
    expect(plan.rows[0].status).toBe('unchanged')
  })
})

describe('buildRenamePlan — prefix / suffix / case', () => {
  it('adds prefix and suffix around the base name, before the extension', () => {
    const plan = buildRenamePlan(['photo.jpg'], opts({ prefix: '2026-', suffix: '_web' }))
    expect(plan.rows[0].newName).toBe('2026-photo_web.jpg')
  })

  it('applies lowercase / uppercase / title case to the base name only', () => {
    expect(buildRenamePlan(['My File.TXT'], opts({ caseTransform: 'lower' })).rows[0].newName).toBe(
      'my file.TXT',
    )
    expect(buildRenamePlan(['My File.txt'], opts({ caseTransform: 'upper' })).rows[0].newName).toBe(
      'MY FILE.txt',
    )
    expect(
      buildRenamePlan(['my file name.txt'], opts({ caseTransform: 'title' })).rows[0].newName,
    ).toBe('My File Name.txt')
  })

  it('handles dotfiles (no extension) as all-base names', () => {
    const plan = buildRenamePlan(['.gitignore'], opts({ suffix: '_bak' }))
    expect(plan.rows[0].newName).toBe('.gitignore_bak')
  })

  it('handles names without any dot', () => {
    const plan = buildRenamePlan(['README'], opts({ prefix: 'x-' }))
    expect(plan.rows[0].newName).toBe('x-README')
  })
})

describe('buildRenamePlan — sequential numbering', () => {
  it('numbers files in list order with zero padding as a suffix', () => {
    const plan = buildRenamePlan(
      ['a.txt', 'b.txt', 'c.txt'],
      opts({ numbering: { enabled: true, position: 'suffix', start: 1, pad: 3 } }),
    )
    expect(plan.rows.map((r) => r.newName)).toEqual(['a-001.txt', 'b-002.txt', 'c-003.txt'])
  })

  it('numbers as a prefix with custom start', () => {
    const plan = buildRenamePlan(
      ['a.txt', 'b.txt'],
      opts({ numbering: { enabled: true, position: 'prefix', start: 9, pad: 2 } }),
    )
    expect(plan.rows.map((r) => r.newName)).toEqual(['09-a.txt', '10-b.txt'])
  })

  it('grows beyond the pad width instead of truncating', () => {
    const plan = buildRenamePlan(
      ['a.txt'],
      opts({ numbering: { enabled: true, position: 'suffix', start: 1234, pad: 2 } }),
    )
    expect(plan.rows[0].newName).toBe('a-1234.txt')
  })
})

describe('buildRenamePlan — combined order', () => {
  it('applies find/replace, then case, then prefix/suffix, then numbering', () => {
    const plan = buildRenamePlan(
      ['IMG_001 Beach.jpeg'],
      opts({
        find: 'IMG_001 ',
        replace: '',
        caseTransform: 'lower',
        prefix: 'holiday-',
        numbering: { enabled: true, position: 'suffix', start: 7, pad: 2 },
      }),
    )
    expect(plan.rows[0].newName).toBe('holiday-beach-07.jpeg')
  })
})

describe('buildRenamePlan — conflicts and validity', () => {
  it('marks files that map to the same name as conflicts and blocks', () => {
    const plan = buildRenamePlan(
      ['a-1.txt', 'a-2.txt', 'b.txt'],
      opts({ find: String.raw`-\d`, replace: '', useRegex: true }),
    )
    expect(plan.rows[0].status).toBe('conflict')
    expect(plan.rows[1].status).toBe('conflict')
    expect(plan.rows[2].status).toBe('unchanged')
    expect(plan.hasBlocking).toBe(true)
  })

  it('marks case-insensitive collisions as conflicts (Windows/macOS safety)', () => {
    const plan = buildRenamePlan(['A.txt', 'a.TXT'], opts({ caseTransform: 'lower' }))
    expect(plan.rows.every((r) => r.status === 'conflict')).toBe(true)
    expect(plan.hasBlocking).toBe(true)
  })

  it('marks names that become empty as invalid and blocks', () => {
    const plan = buildRenamePlan(['abc'], opts({ find: 'abc', replace: '' }))
    expect(plan.rows[0].status).toBe('invalid')
    expect(plan.hasBlocking).toBe(true)
  })

  it('marks names containing path separators as invalid', () => {
    const plan = buildRenamePlan(['a.txt'], opts({ find: 'a', replace: 'x/y' }))
    expect(plan.rows[0].status).toBe('invalid')
    expect(plan.hasBlocking).toBe(true)
  })

  it('flags unchanged names as unchanged, without blocking', () => {
    const plan = buildRenamePlan(['same.txt'], opts())
    expect(plan.rows[0].status).toBe('unchanged')
    expect(plan.hasBlocking).toBe(false)
  })

  it('a well-formed rename has status renamed and does not block', () => {
    const plan = buildRenamePlan(['a.txt'], opts({ prefix: 'p-' }))
    expect(plan.rows[0].status).toBe('renamed')
    expect(plan.hasBlocking).toBe(false)
  })
})
