import type { Mermaid } from 'mermaid'
import DOMPurify from 'dompurify'

let mermaidPromise: Promise<Mermaid> | null = null
let renderSeq = 0

/** Lazy mermaid singleton — ~1.5 MB, loaded only on this route. */
export function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import('mermaid').then((m) => m.default)
  return mermaidPromise
}

/**
 * Validate and render a mermaid definition to sanitized SVG.
 * Throws (with mermaid's own message, including the offending line) on
 * invalid syntax — callers keep showing the previous good render.
 *
 * The top-level `htmlLabels: false` (flowchart.htmlLabels is deprecated
 * since v11.12.3) keeps labels as plain SVG text — no <foreignObject> —
 * so the output survives DOMPurify's SVG profile AND can be drawn onto a
 * canvas for PNG export without tainting it.
 */
export async function renderDiagram(code: string, dark: boolean): Promise<string> {
  const mermaid = await loadMermaid()
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'default',
    fontFamily: 'Manrope Variable, system-ui, sans-serif',
    htmlLabels: false,
  })
  await mermaid.parse(code)
  const { svg } = await mermaid.render(`mermaid-render-${renderSeq++}`, code)
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })
}
