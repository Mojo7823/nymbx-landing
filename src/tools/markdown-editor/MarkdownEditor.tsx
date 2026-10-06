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
import type { HighlighterCore } from 'shiki/core'
import type { EditorView } from '@codemirror/view'
import type { EditorState, TransactionSpec } from '@codemirror/state'
import { ToolLayout } from '../../components/ToolLayout'
import { MarkdownPreview } from '../markdown-renderer/MarkdownPreview'
import { SplitPane } from '../../components/SplitPane'
import { Button } from '../../components/Button'
import { downloadBlob } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { toast } from '../../lib/toast'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { useIsDark } from '../../lib/useIsDark'
import { highlightCode, highlightLanguage, loadHighlighter } from '../markdown-renderer/highlight'
import type * as ToolbarCommands from './commands'
import { clearDraft, loadDraft, saveDraft } from './drafts'
import type * as PreviewPipeline from './preview'
import type { DiagramEntry } from './preview'
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

const EMPTY_RENDERED = { sanitized: '', languages: '' }
const EMPTY_DIAGRAMS = { html: '', mermaidCodes: [] as string[] }

/** Warn when a base64 embed will noticeably bloat the document. */
const EMBED_WARN_BYTES = 500 * 1024
/** Refuse embeds that would make the draft unmanageable. */
const EMBED_MAX_BYTES = 8 * 1024 * 1024

type Command = (state: EditorState, commands: typeof ToolbarCommands) => TransactionSpec

interface ToolbarAction {
  icon: LucideIcon
  label: string
  command: Command
}

const toolbarGroups: ToolbarAction[][] = [
  [
    { icon: Bold, label: 'Bold (Ctrl+B)', command: (s, c) => c.toggleInline(s, '**') },
    { icon: Italic, label: 'Italic (Ctrl+I)', command: (s, c) => c.toggleInline(s, '*') },
    { icon: Code, label: 'Inline code', command: (s, c) => c.toggleInline(s, '`') },
  ],
  [
    { icon: Heading1, label: 'Heading 1', command: (s, c) => c.setHeading(s, 1) },
    { icon: Heading2, label: 'Heading 2', command: (s, c) => c.setHeading(s, 2) },
    { icon: Heading3, label: 'Heading 3', command: (s, c) => c.setHeading(s, 3) },
  ],
  [
    { icon: List, label: 'Bullet list', command: (s, c) => c.toggleBulletList(s) },
    { icon: ListOrdered, label: 'Numbered list', command: (s, c) => c.toggleOrderedList(s) },
    { icon: TextQuote, label: 'Quote', command: (s, c) => c.toggleQuote(s) },
    { icon: SquareCode, label: 'Code block', command: (s, c) => c.toggleCodeBlock(s) },
  ],
  [
    { icon: Link, label: 'Link (Ctrl+K)', command: (s, c) => c.insertLink(s) },
    { icon: Table, label: 'Insert table', command: (s, c) => c.insertTable(s) },
    {
      icon: Image,
      label: 'Image from URL',
      command: (s, c) => c.insertImage(s, 'alt text', 'url'),
    },
  ],
]

export default function MarkdownEditor() {
  const [ready, setReady] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  const [editorError, setEditorError] = useState<Error | null>(null)
  const [previewPipeline, setPreviewPipeline] = useState<typeof PreviewPipeline | null>(null)
  const [previewLoadError, setPreviewLoadError] = useState(false)
  const [source, setSource] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [restored, setRestored] = useState(false)
  const [highlighter, setHighlighter] = useState<{ value: HighlighterCore } | null>(null)
  const [previewVisible, setPreviewVisible] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )
  const [diagrams, setDiagrams] = useState<ReadonlyMap<string, DiagramEntry>>(new Map())
  const dark = useIsDark()
  const debouncedSource = useDebouncedValue(source, 300)

  const editorHost = useRef<HTMLDivElement>(null)
  const previewHost = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const commandsRef = useRef<typeof ToolbarCommands | null>(null)
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

  // The stacked mobile preview is below the editor. Do not render hidden
  // diagrams until that preview is visible (or its focus control is used).
  useEffect(() => {
    const host = previewHost.current
    if (!host) return
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setPreviewVisible(true)
        observer.disconnect()
      }
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  // Editor is created once per theme change (doc carried over via codeRef).
  useEffect(() => {
    const host = editorHost.current
    if (!ready || !host) return
    let cancelled = false
    let view: EditorView | undefined
    void import('./editorRuntime')
      .then(({ createEditor, commands }) => {
        if (cancelled) return
        view = createEditor(host, codeRef.current, dark, (next) => {
          codeRef.current = next
          setSource(next)
        })
        viewRef.current = view
        commandsRef.current = commands
        setEditorReady(true)
        // Syntax is an enhancement; keep it off startup and append it on first focus.
        view.dom.addEventListener(
          'focusin',
          () => {
            void import('./markdownLanguage')
              .then(({ enableMarkdown }) => {
                if (!cancelled && view) {
                  enableMarkdown(view)
                }
              })
              .catch(() => {
                // Keep the full plain editor usable if the optional language chunk fails.
              })
          },
          { once: true },
        )
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setEditorError(error instanceof Error ? error : new Error(String(error)))
        }
      })
    return () => {
      cancelled = true
      view?.destroy()
      if (viewRef.current === view) viewRef.current = null
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

  // The mobile preview is below the fold. Load its real renderer when shown or focused.
  useEffect(() => {
    if (!previewVisible) return
    let cancelled = false
    void import('./preview')
      .then((pipeline) => {
        if (!cancelled) setPreviewPipeline(pipeline)
      })
      .catch(() => {
        if (!cancelled) setPreviewLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [previewVisible])

  const { sanitized, languages } = useMemo(() => {
    if (!previewPipeline) return EMPTY_RENDERED
    const needed = new Set<string>()
    const md = previewPipeline.createEditorRenderer((code, lang) => {
      const name = highlightLanguage(lang)
      if (name) needed.add(name)
      return highlighter ? highlightCode(highlighter.value, code, lang) : ''
    })
    return {
      sanitized: previewPipeline.renderMarkdown(md, debouncedSource),
      languages: [...needed].sort().join(','),
    }
  }, [previewPipeline, highlighter, debouncedSource])

  useEffect(() => {
    if (!languages) return
    let cancelled = false
    void loadHighlighter(languages.split(','))
      .then((value) => {
        // A new wrapper also updates the preview when the singleton gains a
        // grammar after the user adds a different kind of code fence.
        if (!cancelled) setHighlighter({ value })
      })
      .catch(() => {
        // Highlighting is progressive enhancement — plain code blocks remain.
      })
    return () => {
      cancelled = true
    }
  }, [languages])

  // Diagrams are injected into the HTML string itself, so the preview is
  // always fully React-rendered — no post-commit DOM patching.
  const { html, mermaidCodes } = useMemo(() => {
    if (!previewPipeline) return EMPTY_DIAGRAMS
    const result = previewPipeline.injectMermaidDiagrams(sanitized, (code) =>
      diagrams.get(previewPipeline.diagramKey(code, dark)),
    )
    return { html: result.html, mermaidCodes: result.codes }
  }, [previewPipeline, sanitized, dark, diagrams])

  // Render mermaid definitions that aren't cached yet; each completed
  // diagram lands in `diagrams`, which re-runs the injection above.
  useEffect(() => {
    if (!previewVisible || !previewPipeline) return
    for (const code of mermaidCodes) {
      const key = previewPipeline.diagramKey(code, dark)
      if (diagrams.has(key) || pendingDiagrams.current.has(key)) continue
      pendingDiagrams.current.add(key)
      void import('../mermaid-editor/mermaidRenderer')
        .then(({ renderDiagram }) => renderDiagram(code, dark))
        .then((svg) => setDiagrams((prev) => cacheDiagram(prev, key, { svg })))
        .catch((err: unknown) => {
          const error = err instanceof Error ? err.message : String(err)
          setDiagrams((prev) => cacheDiagram(prev, key, { error }))
        })
        .finally(() => pendingDiagrams.current.delete(key))
    }
  }, [mermaidCodes, dark, diagrams, previewVisible, previewPipeline])

  function run(command: Command) {
    const view = viewRef.current
    const commands = commandsRef.current
    if (!view || !commands) return
    view.dispatch(command(view.state, commands))
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
      run((s, c) => c.insertImage(s, file.name, reader.result as string))
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

  if (editorError) throw editorError

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
                disabled={!editorReady}
                className="flex h-8 w-9 cursor-pointer items-center justify-center bg-card text-muted transition-colors not-first:border-l not-first:border-line hover:bg-mint hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
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
                disabled={!editorReady}
                className="flex h-8 w-9 cursor-pointer items-center justify-center bg-card text-muted transition-colors not-first:border-l not-first:border-line hover:bg-mint hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ImagePlus className="size-4" />
              </button>
            )}
          </div>
        ))}

        <div className="ms-auto flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openInput.current?.click()}
            disabled={!editorReady}
          >
            <FileUp className="size-3.5" />
            Open .md
          </Button>
          <Button variant="secondary" size="sm" onClick={exportMd} disabled={!source}>
            <Download className="size-3.5" />
            Export .md
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={discardDraft}
            disabled={!editorReady || (!source && !savedAt)}
          >
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
            <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Editor</h2>
            </div>
            <div
              aria-busy={!editorReady}
              className="relative h-[36rem] overflow-hidden rounded-lg border border-line bg-card focus-within:border-pine"
            >
              <div ref={editorHost} className="h-full" />
              {!editorReady && (
                <p role="status" className="absolute top-3 left-3 text-xs text-muted">
                  Loading editor…
                </p>
              )}
            </div>
          </section>
        }
        second={
          <div ref={previewHost} onFocusCapture={() => setPreviewVisible(true)}>
            <MarkdownPreview
              html={html}
              loading={previewVisible && !previewPipeline && !previewLoadError}
              error={
                previewLoadError
                  ? 'Preview could not be loaded. Check your connection and reload the tool.'
                  : undefined
              }
            />
          </div>
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
