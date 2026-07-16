import { deleteSetting, getSetting, setSetting } from '../../lib/settings'

/**
 * Autosaved editor draft, stored in the shared IndexedDB settings store.
 * Drafts are explicitly allowed there (settings and drafts only — never
 * user files); embedded data-URI images are part of the draft text.
 */
export interface EditorDraft {
  text: string
  savedAt: number
}

const DRAFT_KEY = 'markdown-editor:draft'

export async function loadDraft(): Promise<EditorDraft | undefined> {
  const value = await getSetting(DRAFT_KEY)
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as EditorDraft).text === 'string' &&
    typeof (value as EditorDraft).savedAt === 'number'
  ) {
    return value as EditorDraft
  }
  return undefined
}

export async function saveDraft(text: string): Promise<EditorDraft> {
  const draft: EditorDraft = { text, savedAt: Date.now() }
  await setSetting(DRAFT_KEY, draft)
  return draft
}

export async function clearDraft(): Promise<void> {
  await deleteSetting(DRAFT_KEY)
}
