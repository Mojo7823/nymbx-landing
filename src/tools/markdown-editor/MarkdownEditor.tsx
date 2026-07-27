import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  Bold,
  Code,
  Download,
  FileUp,
  Heading1,
  Heading2,
  Heading3,
  Image,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  SquareCode,
  Table,
  TextQuote,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import type { Highlighter } from 'shiki'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import type { EditorState, TransactionSpec } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { ToolLayout } from '../../components/ToolLayout'
import { SplitPane } from '../../components/SplitPane'
import { Button } from '../../components/Button'
import { downloadBlob } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { toast } from '../../lib/toast'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { useIsDark } from '../../lib/useIsDark'
import { highlightCode, loadHighlighter } from '../markdown-renderer/highlight'
import {
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
import { renderDiagram } from '../mermaid-editor/mermaidRenderer'
import { clearDraft, loadDraft, saveDraft } from './drafts'
import {
  createEditorRenderer,
  diagramKey,
  injectMermaidDiagrams,
  renderMarkdown,
  type DiagramEntry,
} from './preview'
import '../markdown-renderer/preview.css'
import './editor.css'

const SAMPLE = `# Markdown editor

Write on the left. The toolbar wraps your **selection** in markdown.
Your work autosaves to this browser and never leaves your device.

## Everything from the renderer works

- [x] GFM tables, task lists, ~~strikethrough~~
- [x] Syntax-highlighted code blocks
- [x] Mermaid diagrams:

\`\`\`mermaid
flowchart LR
  Draft --> Preview --> Export[.md file]
\`\`\`

| Feature | Status |
| --- | --- |
| Autosave | on |
| Image embedding | URL or base64 |
`

/** Warn when a base64 embed will noticeably bloat the document. */
const EMBED_WARN_BYTES = 500 * 1024
/** Refuse embeds that would make the draft unmanageable. */
const EMBED_MAX_BYTES = 8 * 1024 * 1024

type Command = (state: EditorState) => TransactionSpec

/** Markdown syntax colors via theme tokens — valid in both light and dark. */
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, color: 'var(--c-pine)' },
  { tag: tags.link, color: 'var(--c-pine)' },
  { tag: tags.url, color: 'var(--c-muted)' },
  { tag: tags.quote, color: 'var(--c-muted)', fontStyle: 'italic' },
  { tag: tags.processingInstruction, color: 'var(--c-faint)' },
  { tag: tags.labelName, color: 'var(--c-pine)' },
])

interface ToolbarAction {
  icon: LucideIcon
  label: string
  command: Command
}

const toolbarGroups: ToolbarAction[][] = [
  [
    { icon: Bold, label: 'Bold (Ctrl+B)', command: (s) => toggleInline(s, '**') },
    { icon: Italic, label: 'Italic (Ctrl+I)', command: (s) => toggleInline(s, '*') },
    { icon: Code, label: 'Inline code', command: (s) => toggleInline(s, '`') },
  ],
  [
    { icon: Heading1, label: 'Heading 1', command: (s) => setHeading(s, 1) },
    { icon: Heading2, label: 'Heading 2', command: (s) => setHeading(s, 2) },
    { icon: Heading3, label: 'Heading 3', command: (s) => setHeading(s, 3) },
  ],
  [
    { icon: List, label: 'Bullet list', command: toggleBulletList },
    { icon: ListOrdered, label: 'Numbered list', command: toggleOrderedList },
    { icon: TextQuote, label: 'Quote', command: toggleQuote },
    { icon: SquareCode, label: 'Code block', command: toggleCodeBlock },
  ],
  [
    { icon: Link, label: 'Link (Ctrl+K)', command: insertLink },
    { icon: Table, label: 'Insert table', command: insertTable },
    { icon: Image, label: 'Image from URL', command: (s) => insertImage(s, 'alt text', 'url') },
  ],
]

export default function MarkdownEditor() {
  const [ready, setReady] = useState(false)
  const [source, setSource] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [restored, setRestored] = useState(false)
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null)
  const [diagrams, setDiagrams] = useState<ReadonlyMap<string, DiagramEntry>>(new Map())
  const dark = useIsDark()
  const debouncedSource = useDebouncedValue(source, 300)

  const editorHost = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Diagram renders already in flight — avoids duplicate mermaid work.
  const pendingDiagrams = useRef(new Set<string>())
  const embedInput = useRef<HTMLInputElement>(null)
  const openInput = useRef<HTMLInputElement>(null)
  // Latest editor text, for seeding a recreated editor (theme switch).
  const codeRef = useRef('')
  // Last text persisted to (or loaded from) IndexedDB — skip redundant saves.
  const lastSavedRef = useRef('')

  // Restore the draft (if any) before the editor mounts.
  useEffect(() => {
    let cancelled = false
    void loadDraft().then((draft) => {
      if (cancelled) return
      const text = draft?.text ?? SAMPLE
      codeRef.current = text
      lastSavedRef.current = text
      setSource(text)
      if (draft) {
        setSavedAt(draft.savedAt)
        setRestored(true)
      }
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    loadHighlighter()
      .then((h) => {
        if (!cancelled) setHighlighter(h)
      })
      .catch(() => {
        // Highlighting is progressive enhancement — plain code blocks remain.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Editor is created once per theme change (doc carried over via codeRef).
  useEffect(() => {
    const host = editorHost.current
    if (!ready || !host) return
    const view = new EditorView({
      doc: codeRef.current,
      parent: host,
      extensions: [
        history(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(markdownHighlight),
        keymap.of([
          { key: 'Mod-b', run: dispatchCommand((s) => toggleInline(s, '**')) },
          { key: 'Mod-i', run: dispatchCommand((s) => toggleInline(s, '*')) },
          { key: 'Mod-k', run: dispatchCommand(insertLink) },
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        placeholder('Write markdown here…'),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const next = update.state.doc.toString()
            codeRef.current = next
            setSource(next)
          }
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
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [ready, dark])

  // Autosave the debounced draft; an emptied document clears the draft.
  useEffect(() => {
    if (!ready || debouncedSource === lastSavedRef.current) return
    lastSavedRef.current = debouncedSource
    if (debouncedSource === '') {
      void clearDraft().then(() => setSavedAt(null))
    } else {
      void saveDraft(debouncedSource).then((draft) => setSavedAt(draft.savedAt))
    }
  }, [ready, debouncedSource])

  const md = useMemo(
    () =>
      createEditorRenderer(
        highlighter ? (code, lang) => highlightCode(highlighter, code, lang) : undefined,
      ),
    [highlighter],
  )
  const sanitized = useMemo(() => renderMarkdown(md, debouncedSource), [md, debouncedSource])

  // Diagrams are injected into the HTML string itself, so the preview is
  // always fully React-rendered — no post-commit DOM patching.
  const { html, mermaidCodes } = useMemo(() => {
    const result = injectMermaidDiagrams(sanitized, (code) => diagrams.get(diagramKey(code, dark)))
    return { html: result.html, mermaidCodes: result.codes }
  }, [sanitized, dark, diagrams])

  // Render mermaid definitions that aren't cached yet; each completed
  // diagram lands in `diagrams`, which re-runs the injection above.
  useEffect(() => {
    for (const code of mermaidCodes) {
      const key = diagramKey(code, dark)
      if (diagrams.has(key) || pendingDiagrams.current.has(key)) continue
      pendingDiagrams.current.add(key)
      renderDiagram(code, dark)
        .then((svg) => setDiagrams((prev) => cacheDiagram(prev, key, { svg })))
        .catch((err: unknown) => {
          const error = err instanceof Error ? err.message : String(err)
          setDiagrams((prev) => cacheDiagram(prev, key, { error }))
        })
        .finally(() => pendingDiagrams.current.delete(key))
    }
  }, [mermaidCodes, dark, diagrams])

  function run(command: Command) {
    const view = viewRef.current
    if (!view) return
    view.dispatch(command(view.state))
    view.focus()
  }

  function setEditorText(text: string) {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  }

  function onEmbedImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > EMBED_MAX_BYTES) {
      toast(`Image is ${formatBytes(file.size)}, too large to embed. Link to it by URL instead.`, {
        variant: 'error',
      })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      run((s) => insertImage(s, file.name, reader.result as string))
      if (file.size > EMBED_WARN_BYTES) {
        toast(`Embedded ${formatBytes(file.size)} as base64. Large embeds make the document heavy.`)
      }
    }
    reader.onerror = () => toast('Could not read that image file.', { variant: 'error' })
    reader.readAsDataURL(file)
  }

  async function onOpenFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setEditorText(await file.text())
  }

  function exportMd() {
    downloadBlob(new Blob([source], { type: 'text/markdown' }), 'document.md')
  }

  function discardDraft() {
    setEditorText('')
    setRestored(false)
    void clearDraft().then(() => setSavedAt(null))
  }

  return (
    <ToolLayout
      title="Markdown editor"
      description="A full markdown editor with formatting toolbar, image embedding, mermaid diagrams and autosaved drafts. Everything stays in your browser."
      badge="client-side"
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {toolbarGroups.map((group, gi) => (
          <div
            key={gi}
            role="group"
            className="flex overflow-hidden rounded-md border border-line-strong"
          >
            {group.map((action) => (
              <button
                key={action.label}
                type="button"
                title={action.label}
                aria-label={action.label}
                onClick={() => run(action.command)}
                className="flex h-8 w-9 cursor-pointer items-center justify-center bg-card text-muted transition-colors not-first:border-l not-first:border-line hover:bg-mint hover:text-ink"
              >
                <action.icon className="size-4" />
              </button>
            ))}
            {gi === toolbarGroups.length - 1 && (
              <button
                type="button"
                title="Embed local image (base64)"
                aria-label="Embed local image (base64)"
                onClick={() => embedInput.current?.click()}
                className="flex h-8 w-9 cursor-pointer items-center justify-center bg-card text-muted transition-colors not-first:border-l not-first:border-line hover:bg-mint hover:text-ink"
              >
                <ImagePlus className="size-4" />
              </button>
            )}
          </div>
        ))}

        <div className="ms-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => openInput.current?.click()}>
            <FileUp className="size-3.5" />
            Open .md
          </Button>
          <Button variant="secondary" size="sm" onClick={exportMd} disabled={!source}>
            <Download className="size-3.5" />
            Export .md
          </Button>
          <Button variant="ghost" size="sm" onClick={discardDraft} disabled={!source && !savedAt}>
            <Trash2 className="size-3.5" />
            Discard
          </Button>
        </div>
      </div>

      <input
        ref={embedInput}
        type="file"
        accept="image/*"
        onChange={onEmbedImage}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={openInput}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        onChange={(e) => void onOpenFile(e)}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <SplitPane
        label="Resize editor and preview"
        first={
          <section aria-label="Markdown editor">
            <div className="mb-2 flex h-8 items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Editor</h2>
            </div>
            <div
              ref={editorHost}
              className="h-[36rem] overflow-hidden rounded-lg border border-line bg-card focus-within:border-pine"
            />
          </section>
        }
        second={
          <section aria-label="Rendered preview">
            <div className="mb-2 flex h-8 items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Preview</h2>
            </div>
            {html ? (
              <div
                className="md-preview h-[36rem] overflow-auto rounded-lg border border-line bg-card p-4"
                // Safe: renderMarkdown passes all output through DOMPurify.
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <div className="flex h-[36rem] items-center justify-center rounded-lg border border-dashed border-line-strong text-sm text-muted">
                The rendered document appears here.
              </div>
            )}
          </section>
        }
      />

      <p aria-live="polite" className="mt-4 font-mono text-xs text-muted tabular-nums">
        {!ready
          ? 'Loading draft…'
          : savedAt
            ? `Draft ${restored ? 'restored · ' : ''}saved ${new Date(savedAt).toLocaleTimeString()} · ${source.length.toLocaleString()} characters`
            : `No saved draft · ${source.length.toLocaleString()} characters`}
      </p>
    </ToolLayout>
  )
}

/** Wrap a state command as a CodeMirror keymap handler. */
function dispatchCommand(command: Command) {
  return (view: EditorView) => {
    view.dispatch(command(view.state))
    return true
  }
}

const DIAGRAM_CACHE_LIMIT = 50

/** Immutable cache insert with a simple oldest-first eviction. */
function cacheDiagram(
  prev: ReadonlyMap<string, DiagramEntry>,
  key: string,
  entry: DiagramEntry,
): ReadonlyMap<string, DiagramEntry> {
  const next = new Map(prev)
  if (next.size >= DIAGRAM_CACHE_LIMIT) {
    const oldest = next.keys().next().value
    if (oldest !== undefined) next.delete(oldest)
  }
  next.set(key, entry)
  return next
}
