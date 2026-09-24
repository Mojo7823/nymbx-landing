import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '../../components/Button'

/** Receives only HTML sanitized by the Markdown renderers. */
export function MarkdownPreview({ html }: { html: string }) {
  const [focused, setFocused] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (!focused) return
    const dialog = dialogRef.current
    if (!dialog) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [focused])

  const renderedDocument = html ? (
    // Safe: both callers sanitize their rendered HTML with DOMPurify.
    <div className="md-preview" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <p className="py-16 text-center text-sm text-muted">The rendered document appears here.</p>
  )

  return (
    <section aria-label="Rendered preview">
      <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Preview</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setFocused(true)}>
            <Maximize2 className="size-3.5" />
            Focus preview
          </Button>
        </div>
      </div>
      <div className="markdown-preview-pane h-[36rem] overflow-auto rounded-xl border border-line bg-card p-5">
        {!focused && renderedDocument}
      </div>
      <dialog
        ref={dialogRef}
        aria-label="Focused Markdown preview"
        onClose={() => setFocused(false)}
        className="markdown-focus fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-auto bg-page p-0 text-ink backdrop:bg-page"
      >
        <button
          type="button"
          onClick={() => setFocused(false)}
          aria-label="Exit focus preview"
          title="Exit focus preview (Esc)"
          className="fixed top-4 right-4 z-10 inline-flex size-10 cursor-pointer items-center justify-center rounded-full border border-line bg-card/95 text-muted shadow-sm transition-colors hover:bg-mint hover:text-pine print:hidden"
        >
          <Minimize2 className="size-4" />
        </button>
        <div className="mx-auto min-h-full w-full max-w-4xl px-5 pt-20 pb-16 sm:px-12 sm:pt-16">
          {focused && renderedDocument}
        </div>
      </dialog>
    </section>
  )
}
