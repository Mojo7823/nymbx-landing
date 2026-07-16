import { useEffect, useRef, useState } from 'react'
import { Download, FileImage, TriangleAlert } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { ToolLayout } from '../../components/ToolLayout'
import { SplitPane } from '../../components/SplitPane'
import { Button } from '../../components/Button'
import { toast } from '../../lib/toast'
import { cx } from '../../lib/cx'
import { downloadBlob } from '../../lib/download'
import { svgToPngBlob } from '../../lib/svg'
import { useIsDark } from '../../lib/useIsDark'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { renderDiagram } from './mermaidRenderer'
import { templates } from './templates'

interface RenderState {
  /** Last successful render — kept on screen while errors are shown. */
  svg: string
  error: string | null
  rendered: boolean
}

export default function MermaidEditor() {
  const [code, setCode] = useState(templates[0]!.code)
  const [render, setRender] = useState<RenderState>({ svg: '', error: null, rendered: false })
  const dark = useIsDark()
  const debouncedCode = useDebouncedValue(code, 350)

  const editorHost = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Latest editor text, for seeding a recreated editor (theme switch).
  const codeRef = useRef(code)
  const renderReq = useRef(0)

  // Editor is created once per theme change (doc carried over).
  useEffect(() => {
    const host = editorHost.current
    if (!host) return
    let destroyed = false
    let view: EditorView | undefined
    void Promise.all([import('@codemirror/view'), import('@codemirror/commands')]).then(
      ([
        { EditorView, keymap, lineNumbers, placeholder },
        { defaultKeymap, history, historyKeymap, indentWithTab },
      ]) => {
        if (destroyed) return
        view = new EditorView({
          doc: codeRef.current,
          parent: host,
          extensions: [
            lineNumbers(),
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
            placeholder('Write a mermaid diagram definition…'),
            EditorView.lineWrapping,
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                const next = update.state.doc.toString()
                codeRef.current = next
                setCode(next)
              }
            }),
            EditorView.theme(
              {
                '&': { backgroundColor: 'transparent', fontSize: '13px', height: '100%' },
                '.cm-content': { fontFamily: 'var(--font-mono)' },
                '.cm-scroller': { overflow: 'auto', lineHeight: '1.6' },
                '&.cm-focused': { outline: 'none' },
                '.cm-gutters': {
                  backgroundColor: 'var(--c-soft)',
                  color: 'var(--c-faint)',
                  border: 'none',
                },
              },
              { dark },
            ),
          ],
        })
        viewRef.current = view
      },
    )
    return () => {
      destroyed = true
      view?.destroy()
      viewRef.current = null
    }
  }, [dark])

  // Debounced live render; errors keep the previous good diagram visible.
  useEffect(() => {
    const id = ++renderReq.current
    if (debouncedCode.trim() === '') {
      return
    }
    renderDiagram(debouncedCode, dark)
      .then((svg) => {
        if (renderReq.current !== id) return
        setRender({ svg, error: null, rendered: true })
      })
      .catch((err: unknown) => {
        if (renderReq.current !== id) return
        const message = err instanceof Error ? err.message : String(err)
        setRender((prev) => ({ ...prev, error: message }))
      })
  }, [debouncedCode, dark])

  function setEditorText(text: string) {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  }

  async function exportPng() {
    try {
      const blob = await svgToPngBlob(render.svg, {
        scale: 2,
        background: dark ? '#1b1b1f' : '#ffffff',
      })
      downloadBlob(blob, 'diagram.png')
    } catch {
      toast('PNG export failed — try the SVG export instead.', { variant: 'error' })
    }
  }

  return (
    <ToolLayout
      title="Mermaid editor"
      description="Write mermaid diagram definitions and see them rendered live. Export as SVG or PNG. Everything runs in your browser."
      badge="client-side"
    >
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted">Templates</span>
          <div className="flex flex-wrap overflow-hidden rounded-md border border-line-strong">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setEditorText(t.code)}
                className="cursor-pointer bg-card px-3 py-1.5 text-xs font-medium text-muted transition-colors not-first:border-l not-first:border-line hover:bg-mint hover:text-ink"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SplitPane
        label="Resize editor and diagram"
        first={
          <section aria-label="Diagram definition">
            <div className="mb-2 flex h-8 items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Editor</h2>
              <Button variant="ghost" size="sm" onClick={() => setEditorText('')} disabled={!code}>
                Clear
              </Button>
            </div>
            <div
              ref={editorHost}
              className="h-[32rem] overflow-hidden rounded-lg border border-line bg-card focus-within:border-pine"
            />
          </section>
        }
        second={
          <section aria-label="Rendered diagram">
            <div className="mb-2 flex h-8 items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Diagram</h2>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadBlob(new Blob([render.svg], { type: 'image/svg+xml' }), 'diagram.svg')
                  }
                  disabled={!render.svg}
                >
                  <Download className="size-3.5" />
                  SVG
                </Button>
                <Button variant="secondary" size="sm" onClick={exportPng} disabled={!render.svg}>
                  <FileImage className="size-3.5" />
                  PNG
                </Button>
              </div>
            </div>
            {render.error && (
              <div
                role="alert"
                className="mb-2 flex items-start gap-2 rounded-lg border border-line bg-amber-soft px-3 py-2"
              >
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-badge" />
                <pre className="font-mono text-xs whitespace-pre-wrap text-amber-badge">
                  {render.error}
                </pre>
              </div>
            )}
            <div
              className={cx(
                'flex h-[32rem] items-center justify-center overflow-auto rounded-lg border border-line bg-card p-4',
                render.error && 'opacity-60',
              )}
            >
              {render.svg ? (
                <div
                  className="[&_svg]:h-auto [&_svg]:max-w-full"
                  data-testid="diagram"
                  // Safe: renderDiagram sanitizes the SVG with DOMPurify.
                  dangerouslySetInnerHTML={{ __html: render.svg }}
                />
              ) : (
                <p className="text-sm text-muted">
                  {render.rendered || debouncedCode.trim() === ''
                    ? 'The rendered diagram appears here.'
                    : 'Rendering diagram…'}
                </p>
              )}
            </div>
          </section>
        }
      />
    </ToolLayout>
  )
}
