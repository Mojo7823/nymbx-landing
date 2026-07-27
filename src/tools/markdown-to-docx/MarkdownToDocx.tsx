import { useRef, useState } from 'react'
import { FileDown, FileUp, FileWarning, Sparkles } from 'lucide-react'
import { ToolLayout } from '../../components/ToolLayout'
import { Button } from '../../components/Button'
import { ProgressBar } from '../../components/ProgressBar'
import { downloadBlob } from '../../lib/download'
import { mdToIr } from './mdToIr'

const SAMPLE = `# Project report

## Summary

This quarter we shipped **twelve** features, *deprecated* two, and fixed ~~countless~~ many bugs.
See the [changelog](https://example.com/changelog) for details.

## Highlights

1. New onboarding flow
2. Faster exports
   - PDF pipeline rewritten
   - CSV streaming
3. Accessibility audit passed

> "The best release so far." (a happy user)

## Metrics

| Metric | Q1 | Q2 |
| --- | --- | --- |
| Users | 1,204 | 1,875 |
| Uptime | 99.2% | 99.9% |

## Example

\`\`\`ts
export function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`

---

*Generated with the NYMBX toolbox.*
`

export default function MarkdownToDocx() {
  const [text, setText] = useState('')
  const [baseName, setBaseName] = useState('document')
  const [fetchRemote, setFetchRemote] = useState(false)
  const [converting, setConverting] = useState(false)
  const [warnings, setWarnings] = useState<string[] | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function openFile(file: File | undefined) {
    if (!file) return
    setText(await file.text())
    setBaseName(file.name.replace(/\.(md|markdown|txt)$/i, ''))
    setWarnings(null)
    setDone(null)
  }

  async function convert() {
    if (!text.trim() || converting) return
    setError(null)
    setWarnings(null)
    setDone(null)
    setConverting(true)
    try {
      const { blocks, warnings: parseWarnings } = mdToIr(text)
      // docx is heavy — load it only when a conversion actually runs.
      const { irToDocxBlob } = await import('./irToDocx')
      const { blob, warnings: buildWarnings } = await irToDocxBlob(blocks, {
        fetchRemoteImages: fetchRemote,
      })
      downloadBlob(blob, `${baseName}.docx`)
      setWarnings([...parseWarnings, ...buildWarnings])
      setDone(
        `Converted ${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'} → ${baseName}.docx`,
      )
    } catch {
      setError('Conversion failed. Please check the markdown and try again.')
    } finally {
      setConverting(false)
    }
  }

  return (
    <ToolLayout
      title="Markdown → DOCX"
      description="Turn markdown into a Word document: headings map to Word styles, plus lists, tables, code blocks, links and images. Everything stays in your browser."
      badge="client-side"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
          <FileUp className="size-3.5" />
          Open .md file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt,text/markdown,text/plain"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void openFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <Button variant="ghost" size="sm" onClick={() => setText(SAMPLE)}>
          <Sparkles className="size-3.5" />
          Load sample
        </Button>
        <span className="ml-auto font-mono text-[11px] text-muted tabular-nums">
          {text.length.toLocaleString()} characters
        </span>
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setDone(null)
        }}
        placeholder="Paste or type markdown here, or open a .md file…"
        aria-label="Markdown input"
        spellCheck={false}
        className="h-72 w-full resize-y rounded-lg border border-line bg-card p-3 font-mono text-xs leading-relaxed text-ink placeholder:text-faint focus:border-pine focus:outline-none md:h-96"
      />

      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={fetchRemote}
          onChange={(e) => setFetchRemote(e.target.checked)}
          className="mt-0.5 size-3.5 accent-(--color-pine)"
        />
        <span>
          Fetch web images (<code className="font-mono">http(s)://…</code>) and embed them.{' '}
          <span className="text-faint">
            Off by default: when enabled, images are downloaded from their servers, though the
            markdown itself still never leaves this device.
          </span>
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button onClick={() => void convert()} disabled={!text.trim() || converting}>
          <FileDown className="size-4" />
          Convert to DOCX
        </Button>
        {converting && <ProgressBar className="min-w-40 flex-1" label="Converting" />}
        {done && !converting && (
          <p className="font-mono text-[11px] text-pine tabular-nums" role="status">
            {done}
          </p>
        )}
      </div>

      {warnings && warnings.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 rounded-lg border border-line bg-card p-4">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5 text-xs text-amber-badge">
              <FileWarning className="mt-0.5 size-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </ToolLayout>
  )
}
