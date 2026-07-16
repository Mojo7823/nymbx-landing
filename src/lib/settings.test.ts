import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { deleteSetting, getSetting, setSetting } from './settings'

describe('settings store', () => {
  it('round-trips a value', async () => {
    await setSetting('theme', 'dark')
    expect(await getSetting('theme')).toBe('dark')
  })

  it('returns undefined for unset keys', async () => {
    expect(await getSetting('never-set')).toBeUndefined()
  })

  it('deletes values', async () => {
    await setSetting('theme', 'light')
    await deleteSetting('theme')
    expect(await getSetting('theme')).toBeUndefined()
  })
})
