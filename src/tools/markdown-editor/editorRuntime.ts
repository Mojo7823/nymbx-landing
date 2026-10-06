import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import type { EditorState, TransactionSpec } from '@codemirror/state'
import * as commands from './commands'

export { commands }

/** Load the full editor after the tool frame can paint, without blocking its heading. */
export function createEditor(
  parent: HTMLElement,
  doc: string,
  dark: boolean,
  onChange: (source: string) => void,
): EditorView {
  return new EditorView({
    doc,
    parent,
    extensions: [
      history(),
      keymap.of([
        { key: 'Mod-b', run: dispatchCommand((s) => commands.toggleInline(s, '**')) },
        { key: 'Mod-i', run: dispatchCommand((s) => commands.toggleInline(s, '*')) },
        { key: 'Mod-k', run: dispatchCommand(commands.insertLink) },
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      placeholder('Write markdown here…'),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown source' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString())
      }),
      EditorView.theme(
        {
          '&': { backgroundColor: 'transparent', fontSize: '13px', height: '100%' },
          '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px' },
          '.cm-scroller': { overflow: 'auto', lineHeight: '1.6' },
          '&.cm-focused': { outline: 'none' },
        },
        { dark },
      ),
    ],
  })
}

function dispatchCommand(command: (state: EditorState) => TransactionSpec) {
  return (view: EditorView) => {
    view.dispatch(command(view.state))
    return true
  }
}
