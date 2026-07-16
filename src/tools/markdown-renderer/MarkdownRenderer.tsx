import { useEffect, useMemo, useState } from 'react'
import { ClipboardPaste, Download, Printer, X } from 'lucide-react'
import type { Highlighter } from 'shiki'
import { ToolLayout } from '../../components/ToolLayout'
import { SplitPane } from '../../components/SplitPane'
import { Button } from '../../components/Button'
import { CopyButton } from '../../components/CopyButton'
import { downloadBlob } from '../../lib/download'
import { toast } from '../../lib/toast'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { createRenderer, renderMarkdown } from './renderMarkdown'
import { highlightCode, loadHighlighter } from './highlight'
import './preview.css'

const SAMPLE = `# Markdown renderer

Type on the left, see the result here. **GFM** is supported:

| Feature | Status |
| --- | --- |
| Tables | works |
| ~~Strikethrough~~ | works |

- [x] Task lists
- [ ] With checkboxes

\`\`\`ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`

> Everything is sanitized — try pasting \`<script>alert(1)</script>\`.
`

/** Minimal standalone styles for the exported .html file (light theme). */
const EXPORT_CSS = `
body { max-width: 48rem; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; line-height: 1.7; color: #213547; }
h1, h2 { padding-bottom: .3em; border-bottom: 1px solid #e2e2e3; }
pre { background: #f6f6f7; border: 1px solid #e2e2e3; border-radius: 8px; padding: .85em 1em; overflow-x: auto; }
code { font-family: ui-monospace, monospace; font-size: .9em; }
:not(pre) > code { background: #f6f6f7; border: 1px solid #e2e2e3; border-radius: 4px; padding: .1em .35em; }
table { border-collapse: collapse; } th, td { border: 1px solid #c8c8ca; padding: .35em .75em; }
blockquote { border-left: 3px solid #c8c8ca; margin-left: 0; padding-left: 1em; color: #67676c; }
img { max-width: 100%; }
`

export default function MarkdownRenderer() {
  const [source, setSource] = useState(SAMPLE)
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null)
  const debouncedSource = useDebouncedValue(source, 200)

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

  const md = useMemo(
    () =>
      createRenderer(
        highlighter ? (code, lang) => highlightCode(highlighter, code, lang) : undefined,
      ),
    [highlighter],
  )
  const html = useMemo(() => renderMarkdown(md, debouncedSource), [md, debouncedSource])

  async function pasteFromClipboard() {
    try {
      setSource(await navigator.clipboard.readText())
    } catch {
      toast('Clipboard access was blocked — paste into the text box instead.', {
        variant: 'error',
      })
    }
  }

  function exportHtml() {
    const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Exported markdown</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
${html}
</body>
</html>
`
    downloadBlob(new Blob([doc], { type: 'text/html' }), 'document.html')
  }

  return (
    <ToolLayout
      title="Markdown renderer"
      description="Live GFM preview with syntax-highlighted code blocks. The rendered HTML is sanitized and everything runs in your browser."
      badge="client-side"
    >
      <SplitPane
        label="Resize editor and preview"
        first={
          <section aria-label="Markdown input">
            <div className="mb-2 flex h-8 items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Markdown</h2>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={pasteFromClipboard}>
                  <ClipboardPaste className="size-3.5" />
                  Paste
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSource('')} disabled={!source}>
                  <X className="size-3.5" />
                  Clear
                </Button>
              </div>
            </div>
            <textarea
              id="md-input"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Type or paste markdown here…"
              aria-label="Markdown source"
              spellCheck={false}
              className="h-[36rem] w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-[13px] leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none"
            />
          </section>
        }
        second={
          <section aria-label="Rendered preview">
            <div className="mb-2 flex h-8 items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Preview</h2>
              <div className="flex gap-2">
                <CopyButton text={html} label="Copy HTML" disabled={!html} />
                <Button variant="secondary" size="sm" onClick={exportHtml} disabled={!html}>
                  <Download className="size-3.5" />
                  Export .html
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.print()}
                  disabled={!html}
                >
                  <Printer className="size-3.5" />
                  Print
                </Button>
              </div>
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
        {highlighter === null ? 'Loading syntax highlighter…' : ''}
      </p>
    </ToolLayout>
  )
}
