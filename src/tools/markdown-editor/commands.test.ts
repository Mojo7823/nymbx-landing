import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state'
import {
  TABLE_SNIPPET,
  insertImage,
  insertLink,
  insertTable,
  setHeading,
  toggleBulletList,
  toggleCodeBlock,
  toggleInline,
  toggleOrderedList,
  toggleQuote,
} from './commands'

function stateOf(doc: string, anchor: number, head = anchor): EditorState {
  return EditorState.create({ doc, selection: EditorSelection.single(anchor, head) })
}

function apply(state: EditorState, spec: TransactionSpec) {
  const tr = state.update(spec)
  return {
    doc: tr.state.doc.toString(),
    from: tr.state.selection.main.from,
    to: tr.state.selection.main.to,
    selected: tr.state.sliceDoc(tr.state.selection.main.from, tr.state.selection.main.to),
    state: tr.state,
  }
}

describe('toggleInline', () => {
  it('wraps a selection in bold markers and keeps it selected', () => {
    const s = stateOf('hello world', 0, 5)
    const r = apply(s, toggleInline(s, '**'))
    expect(r.doc).toBe('**hello** world')
    expect(r.selected).toBe('hello')
  })

  it('unwraps when the markers sit just outside the selection', () => {
    const s = stateOf('**hello** world', 2, 7)
    const r = apply(s, toggleInline(s, '**'))
    expect(r.doc).toBe('hello world')
    expect(r.selected).toBe('hello')
  })

  it('unwraps when the markers are inside the selection', () => {
    const s = stateOf('**hello** world', 0, 9)
    const r = apply(s, toggleInline(s, '**'))
    expect(r.doc).toBe('hello world')
    expect(r.selected).toBe('hello')
  })

  it('re-applying is a round trip', () => {
    const s = stateOf('some text', 5, 9)
    const once = apply(s, toggleInline(s, '*'))
    expect(once.doc).toBe('some *text*')
    const twice = apply(once.state, toggleInline(once.state, '*'))
    expect(twice.doc).toBe('some text')
  })

  it('places the cursor between markers for an empty selection', () => {
    const s = stateOf('ab', 1)
    const r = apply(s, toggleInline(s, '`'))
    expect(r.doc).toBe('a``b')
    expect(r.from).toBe(2)
    expect(r.to).toBe(2)
  })

  it('handles selection at the very start and end of the document', () => {
    const s = stateOf('word', 0, 4)
    const r = apply(s, toggleInline(s, '~~'))
    expect(r.doc).toBe('~~word~~')
  })
})

describe('setHeading', () => {
  it('adds a heading prefix to the current line', () => {
    const s = stateOf('title\nbody', 2)
    const r = apply(s, setHeading(s, 2))
    expect(r.doc).toBe('## title\nbody')
  })

  it('switches an existing heading to the new level', () => {
    const s = stateOf('# title', 3)
    const r = apply(s, setHeading(s, 3))
    expect(r.doc).toBe('### title')
  })

  it('toggles off when the line already has that level', () => {
    const s = stateOf('## title', 4)
    const r = apply(s, setHeading(s, 2))
    expect(r.doc).toBe('title')
  })

  it('applies to every selected line', () => {
    const s = stateOf('one\ntwo', 0, 7)
    const r = apply(s, setHeading(s, 1))
    expect(r.doc).toBe('# one\n# two')
  })
})

describe('list and quote toggles', () => {
  it('adds bullets to all selected lines', () => {
    const s = stateOf('a\nb\nc', 0, 5)
    const r = apply(s, toggleBulletList(s))
    expect(r.doc).toBe('- a\n- b\n- c')
  })

  it('removes bullets when every line is already bulleted', () => {
    const s = stateOf('- a\n- b', 0, 7)
    const r = apply(s, toggleBulletList(s))
    expect(r.doc).toBe('a\nb')
  })

  it('numbers ordered lists sequentially', () => {
    const s = stateOf('a\nb\nc', 0, 5)
    const r = apply(s, toggleOrderedList(s))
    expect(r.doc).toBe('1. a\n2. b\n3. c')
  })

  it('removes ordered prefixes on toggle', () => {
    const s = stateOf('1. a\n2. b', 0, 9)
    const r = apply(s, toggleOrderedList(s))
    expect(r.doc).toBe('a\nb')
  })

  it('converts a bulleted selection to an ordered list in one step', () => {
    const s = stateOf('- a\n- b', 0, 7)
    const r = apply(s, toggleOrderedList(s))
    expect(r.doc).toBe('1. a\n2. b')
  })

  it('toggles quotes', () => {
    const s = stateOf('a\nb', 0, 3)
    const quoted = apply(s, toggleQuote(s))
    expect(quoted.doc).toBe('> a\n> b')
    const unquoted = apply(quoted.state, toggleQuote(quoted.state))
    expect(unquoted.doc).toBe('a\nb')
  })
})

describe('toggleCodeBlock', () => {
  it('wraps the selected lines in fences', () => {
    const s = stateOf('let x = 1\nlet y = 2', 0, 19)
    const r = apply(s, toggleCodeBlock(s))
    expect(r.doc).toBe('```\nlet x = 1\nlet y = 2\n```')
  })

  it('inserts an empty fence at an empty selection', () => {
    const s = stateOf('', 0)
    const r = apply(s, toggleCodeBlock(s))
    expect(r.doc).toBe('```\n\n```\n')
    expect(r.from).toBe(3) // cursor on the language slot
  })
})

describe('insertLink', () => {
  it('turns selected text into a link and selects the url placeholder', () => {
    const s = stateOf('visit docs now', 6, 10)
    const r = apply(s, insertLink(s))
    expect(r.doc).toBe('visit [docs](url) now')
    expect(r.selected).toBe('url')
  })

  it('inserts a template with the label selected when nothing is selected', () => {
    const s = stateOf('', 0)
    const r = apply(s, insertLink(s))
    expect(r.doc).toBe('[link text](url)')
    expect(r.selected).toBe('link text')
  })
})

describe('insertImage', () => {
  it('inserts an image reference at the cursor', () => {
    const s = stateOf('before after', 7)
    const r = apply(s, insertImage(s, 'photo.png', 'data:image/png;base64,AAAA'))
    expect(r.doc).toBe('before ![photo.png](data:image/png;base64,AAAA)after')
  })

  it('replaces a selection', () => {
    const s = stateOf('xxxx', 0, 4)
    const r = apply(s, insertImage(s, 'a', 'https://example.com/a.png'))
    expect(r.doc).toBe('![a](https://example.com/a.png)')
  })
})

describe('insertTable', () => {
  it('inserts the snippet on its own paragraph after a non-empty line', () => {
    const s = stateOf('text', 2)
    const r = apply(s, insertTable(s))
    expect(r.doc).toBe(`text\n\n${TABLE_SNIPPET}\n`)
  })

  it('inserts in place on an empty line', () => {
    const s = stateOf('', 0)
    const r = apply(s, insertTable(s))
    expect(r.doc).toBe(`${TABLE_SNIPPET}\n`)
  })
})
