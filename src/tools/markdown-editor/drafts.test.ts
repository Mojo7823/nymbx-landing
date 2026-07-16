import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { clearDraft, loadDraft, saveDraft } from './drafts'

describe('markdown editor drafts', () => {
  it('round-trips a draft with its timestamp', async () => {
    const saved = await saveDraft('# hello')
    const loaded = await loadDraft()
    expect(loaded).toEqual(saved)
    expect(loaded?.text).toBe('# hello')
  })

  it('preserves base64 data URIs exactly', async () => {
    const text = '![img](data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)'
    await saveDraft(text)
    expect((await loadDraft())?.text).toBe(text)
  })

  it('returns undefined after clearing', async () => {
    await saveDraft('something')
    await clearDraft()
    expect(await loadDraft()).toBeUndefined()
  })

  it('returns undefined when nothing was ever saved', async () => {
    await clearDraft()
    expect(await loadDraft()).toBeUndefined()
  })
})
