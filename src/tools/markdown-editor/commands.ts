import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type Line,
  type TransactionSpec,
} from '@codemirror/state'

/**
 * Pure toolbar transforms: each takes the current editor state and returns a
 * transaction spec, so they can be unit-tested without a DOM. Selection
 * positions in the returned ranges follow `changeByRange` semantics (they are
 * coordinates in the changed document).
 */

/** Toggle an inline marker (`**`, `*`, `` ` ``, `~~`) around each selection. */
export function toggleInline(state: EditorState, marker: string): TransactionSpec {
  const len = marker.length
  return state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to)
    // Selected text includes the markers → strip them.
    if (text.length >= 2 * len && text.startsWith(marker) && text.endsWith(marker)) {
      return {
        changes: [
          { from: range.from, to: range.from + len },
          { from: range.to - len, to: range.to },
        ],
        range: EditorSelection.range(range.from, range.to - 2 * len),
      }
    }
    // Markers sit just outside the selection → remove them.
    const before = state.sliceDoc(Math.max(0, range.from - len), range.from)
    const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + len))
    if (before === marker && after === marker) {
      return {
        changes: [
          { from: range.from - len, to: range.from },
          { from: range.to, to: range.to + len },
        ],
        range: EditorSelection.range(range.from - len, range.to - len),
      }
    }
    // Wrap; an empty selection gets the cursor placed between the markers.
    return {
      changes: [
        { from: range.from, insert: marker },
        { from: range.to, insert: marker },
      ],
      range: range.empty
        ? EditorSelection.cursor(range.from + len)
        : EditorSelection.range(range.from + len, range.to + len),
    }
  })
}

/** All lines touched by a selection range. */
function selectedLines(state: EditorState, from: number, to: number): Line[] {
  const lines: Line[] = []
  const last = state.doc.lineAt(to).number
  for (let n = state.doc.lineAt(from).number; n <= last; n++) {
    lines.push(state.doc.line(n))
  }
  return lines
}

/**
 * Rewrite the start of each selected line. `getPrefix` receives the current
 * line and its index within the selection and returns the prefix length to
 * remove plus the replacement prefix. Edits stay at line starts so cursor
 * positions inside lines survive via position mapping.
 */
function changeLineStarts(
  state: EditorState,
  getChange: (line: Line, index: number) => { strip: number; insert: string },
): TransactionSpec {
  return state.changeByRange((range) => {
    const changes: ChangeSpec[] = []
    selectedLines(state, range.from, range.to).forEach((line, i) => {
      const { strip, insert } = getChange(line, i)
      if (strip > 0 || insert !== '') {
        changes.push({ from: line.from, to: line.from + strip, insert })
      }
    })
    const set = state.changes(changes)
    return {
      changes,
      range: EditorSelection.range(set.mapPos(range.anchor, 1), set.mapPos(range.head, 1)),
    }
  })
}

const HEADING_RE = /^#{1,6}\s+/
const BULLET_RE = /^[-*+]\s+/
const ORDERED_RE = /^\d+\.\s+/
const LIST_RE = /^(?:[-*+]|\d+\.)\s+/
const QUOTE_RE = /^>\s?/

/** Set (or toggle off, when already at that level) a heading on each line. */
export function setHeading(state: EditorState, level: number): TransactionSpec {
  const prefix = '#'.repeat(level) + ' '
  return changeLineStarts(state, (line) => {
    const existing = HEADING_RE.exec(line.text)?.[0] ?? ''
    const insert = existing === prefix ? '' : prefix
    return { strip: existing.length, insert }
  })
}

/**
 * Toggle a line prefix on the selection as a whole: removed when every line
 * already matches `re`, otherwise added — replacing whatever `stripRe`
 * matches, so switching between list styles is a single action.
 */
function toggleLinePrefix(
  state: EditorState,
  re: RegExp,
  stripRe: RegExp,
  insertFor: (index: number) => string,
): TransactionSpec {
  const { from, to } = state.selection.main
  const allPrefixed = selectedLines(state, from, to).every((l) => re.test(l.text))
  return changeLineStarts(state, (line, i) => {
    if (allPrefixed) {
      return { strip: re.exec(line.text)?.[0].length ?? 0, insert: '' }
    }
    return { strip: stripRe.exec(line.text)?.[0].length ?? 0, insert: insertFor(i) }
  })
}

export function toggleBulletList(state: EditorState): TransactionSpec {
  return toggleLinePrefix(state, BULLET_RE, LIST_RE, () => '- ')
}

export function toggleOrderedList(state: EditorState): TransactionSpec {
  return toggleLinePrefix(state, ORDERED_RE, LIST_RE, (i) => `${i + 1}. `)
}

export function toggleQuote(state: EditorState): TransactionSpec {
  return toggleLinePrefix(state, QUOTE_RE, QUOTE_RE, () => '> ')
}

/**
 * Wrap the selected lines in a fenced code block; an empty selection inserts
 * an empty fence with the cursor on the language slot.
 */
export function toggleCodeBlock(state: EditorState): TransactionSpec {
  const range = state.selection.main
  if (range.empty) {
    const line = state.doc.lineAt(range.head)
    const prefix = line.text === '' ? '' : '\n\n'
    const insert = `${prefix}\`\`\`\n\n\`\`\`\n`
    const from = line.text === '' ? line.from : line.to
    return {
      changes: { from, insert },
      selection: EditorSelection.cursor(from + prefix.length + 3),
    }
  }
  const firstLine = state.doc.lineAt(range.from)
  const lastLine = state.doc.lineAt(range.to)
  return {
    changes: [
      { from: firstLine.from, insert: '```\n' },
      { from: lastLine.to, insert: '\n```' },
    ],
    selection: EditorSelection.range(range.from + 4, range.to + 4),
  }
}

/**
 * Turn the selection into a link. With text selected, the `url` placeholder
 * is selected for immediate typing; with an empty selection, the placeholder
 * text is selected instead.
 */
export function insertLink(state: EditorState): TransactionSpec {
  return state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to)
    const label = text === '' ? 'link text' : text
    const insert = `[${label}](url)`
    return {
      changes: { from: range.from, to: range.to, insert },
      range:
        text === ''
          ? EditorSelection.range(range.from + 1, range.from + 1 + label.length)
          : EditorSelection.range(range.from + label.length + 3, range.from + label.length + 6),
    }
  })
}

/** Insert an image reference; `src` may be a URL or a base64 data URI. */
export function insertImage(state: EditorState, alt: string, src: string): TransactionSpec {
  const range = state.selection.main
  const insert = `![${alt}](${src})`
  return {
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(range.from + insert.length),
  }
}

export const TABLE_SNIPPET = [
  '| Column 1 | Column 2 | Column 3 |',
  '| --- | --- | --- |',
  '|  |  |  |',
  '|  |  |  |',
].join('\n')

/** Insert a block of markdown on its own paragraph after the current line. */
export function insertBlock(state: EditorState, block: string): TransactionSpec {
  const line = state.doc.lineAt(state.selection.main.head)
  const prefix = line.text === '' ? '' : '\n\n'
  const insert = `${prefix}${block}\n`
  return {
    changes: { from: line.to, insert },
    selection: EditorSelection.cursor(line.to + insert.length),
  }
}

export function insertTable(state: EditorState): TransactionSpec {
  return insertBlock(state, TABLE_SNIPPET)
}
