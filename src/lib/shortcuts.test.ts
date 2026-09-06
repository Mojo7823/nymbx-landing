import { describe, expect, it } from 'vitest'
import { isEditableTarget, matchShortcut, shortcutList } from './shortcuts'

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('isEditableTarget', () => {
  it('is true for form fields', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isEditableTarget(document.createElement(tag)), tag).toBe(true)
    }
  })

  it('is true inside a contenteditable region', () => {
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    const child = document.createElement('span')
    editor.append(child)
    expect(isEditableTarget(child)).toBe(true)
  })

  it('is false for ordinary elements and non-elements', () => {
    expect(isEditableTarget(document.createElement('button'))).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})

describe('matchShortcut', () => {
  it('claims Ctrl+K and ⌘+K', () => {
    expect(matchShortcut(key({ key: 'k', ctrlKey: true }))).toBe('focus-search')
    expect(matchShortcut(key({ key: 'K', metaKey: true }))).toBe('focus-search')
  })

  it('claims /, ? and Shift+D', () => {
    expect(matchShortcut(key({ key: '/' }))).toBe('focus-search')
    expect(matchShortcut(key({ key: '?', shiftKey: true }))).toBe('open-help')
    expect(matchShortcut(key({ key: 'D', shiftKey: true }))).toBe('toggle-theme')
  })

  it('leaves other keys and modifier combinations alone', () => {
    expect(matchShortcut(key({ key: 'd' }))).toBeNull()
    expect(matchShortcut(key({ key: 's', ctrlKey: true }))).toBeNull()
    expect(matchShortcut(key({ key: 'k', ctrlKey: true, shiftKey: true }))).toBeNull()
    expect(matchShortcut(key({ key: 'D', shiftKey: true, altKey: true }))).toBeNull()
    expect(matchShortcut(key({ key: 'Escape' }))).toBeNull()
  })
})

describe('editable-target policy', () => {
  it('keeps the Ctrl/⌘+K chord usable from a field, unlike the bare keys', () => {
    // The hook's rule: bare keys are suppressed on editable targets, chords are not.
    const input = document.createElement('input')
    expect(isEditableTarget(input)).toBe(true)
    expect(matchShortcut(key({ key: 'k', ctrlKey: true }))).toBe('focus-search')
    expect(matchShortcut(key({ key: '/' }))).toBe('focus-search')
  })
})

describe('shortcutList', () => {
  it('swaps Ctrl for ⌘ on Apple platforms', () => {
    expect(shortcutList(false)[0]!.keys).toEqual(['Ctrl', 'K'])
    expect(shortcutList(true)[0]!.keys).toEqual(['⌘', 'K'])
  })
})
