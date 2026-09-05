import DOMPurify from 'dompurify'
import {
  createTurndown,
  prepareDomForMarkdown,
  type TurndownOptions,
} from '../../lib/htmlToMarkdown'
import { countDomStats, type DomCounts } from './stats'

export interface ConvertProgress {
  done: number
  total: number
}

export interface ConvertResult {
  markdown: string
  /** Counts taken from the sanitized DOM, for the stats line. */
  counts: DomCounts
}

/** Thrown by {@link convertHtml} when its `AbortSignal` fires between batches. */
export class ConvertCancelled extends Error {
  constructor() {
    super('Conversion cancelled')
    this.name = 'ConvertCancelled'
  }
}

/**
 * Beyond DOMPurify's defaults (which already drop `<script>`, `on*` handlers,
 * `javascript:` URLs and `<iframe>`): `<style>`/`<noscript>`/`<template>` carry
 * no markdown, and `<svg>`/`<math>` never convert to anything useful.
 * `<input>` stays allowed so GFM task-list checkboxes survive.
 */
const FORBID_TAGS = ['style', 'noscript', 'template', 'svg', 'math']

/** Sanitize `html` to a detached `<body>` element — one parse, no re-serialization. */
export function sanitizeHtml(html: string): HTMLElement {
  return DOMPurify.sanitize(html, { RETURN_DOM: true, FORBID_TAGS }) as HTMLElement
}

/** Roughly how many top-level nodes go into one batch. */
export const BATCH_SIZE = 200

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DETAILS',
  'DIALOG',
  'DIV',
  'DL',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HGROUP',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'UL',
])

function isBlockNode(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.nodeName)
}

/**
 * Split top-level nodes into batches of about `batchSize`. A batch may only end
 * right before a block-level node, so a paragraph written as a run of bare
 * inline/text nodes is never cut in half.
 */
export function groupTopLevelNodes(nodes: Node[], batchSize = BATCH_SIZE): Node[][] {
  const batches: Node[][] = []
  let current: Node[] = []
  for (const node of nodes) {
    if (current.length >= batchSize && isBlockNode(node)) {
      batches.push(current)
      current = []
    }
    current.push(node)
  }
  if (current.length > 0) batches.push(current)
  return batches
}

/** Hand the main thread back to the browser so it can paint and handle input. */
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    // Wait for a painted frame first — a plain setTimeout(0) can run before
    // the browser paints, so the click that started a run would still sit
    // behind the long synchronous parse. The timeout keeps hidden tabs, where
    // requestAnimationFrame never fires, moving.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(finish, 0))
    }
    setTimeout(finish, 100)
  })
}

/** Collapse runs of blank lines and trim — the seams between batches. */
export function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Sanitize, prepare and convert `html` to GFM markdown on the main thread
 * (turndown needs `DOMParser`, which Web Workers lack). Large documents are
 * converted in batches of top-level blocks that yield to the event loop between
 * them, so the tab stays responsive and progress can be reported.
 */
export async function convertHtml(
  html: string,
  options: TurndownOptions = {},
  onProgress?: (progress: ConvertProgress) => void,
  signal?: AbortSignal,
): Promise<ConvertResult> {
  // Sanitizing and preparing a multi-megabyte document are each a long
  // synchronous step; yield between them so the progress bar and the options
  // row stay interactive from the first frame.
  // Let the click or drop that started this run paint before the long
  // synchronous DOMPurify parse of a large document.
  await yieldToUi()
  const body = sanitizeHtml(html)
  await yieldToUi()
  prepareDomForMarkdown(body, options)
  await yieldToUi()
  const counts = countDomStats(body)

  const turndown = await createTurndown(options)
  await yieldToUi()
  const batches = groupTopLevelNodes(Array.from(body.childNodes))
  const total = batches.length
  if (total === 0) return { markdown: '', counts }

  const doc = body.ownerDocument
  const chunks: string[] = []
  for (const [index, batch] of batches.entries()) {
    if (signal?.aborted) throw new ConvertCancelled()
    const fragment = doc.createDocumentFragment()
    // Moves the nodes out of `body`; nothing else reads it after this point.
    for (const node of batch) fragment.appendChild(node)
    const chunk = turndown.turndown(fragment).trim()
    if (chunk !== '') chunks.push(chunk)
    onProgress?.({ done: index + 1, total })
    if (index < total - 1) await yieldToUi()
  }
  if (signal?.aborted) throw new ConvertCancelled()

  return { markdown: normalizeMarkdown(chunks.join('\n\n')), counts }
}

/** {@link convertHtml} without the stats — the plain string form. */
export async function htmlToMarkdown(
  html: string,
  options: TurndownOptions = {},
  onProgress?: (progress: ConvertProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  return (await convertHtml(html, options, onProgress, signal)).markdown
}
