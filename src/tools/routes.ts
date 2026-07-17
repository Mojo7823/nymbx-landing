import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * Lazy-loaded tool implementations, keyed by registry slug.
 * Each phase adds exactly one entry so tool dependencies never
 * reach the dashboard bundle:
 *
 *   'diff-checker': lazy(() => import('./diff-checker/DiffChecker')),
 *
 * A registry entry without a component here renders the
 * coming-soon placeholder page.
 */
export const toolComponents: Partial<Record<string, LazyExoticComponent<ComponentType>>> = {
  'em-dash-remover': lazy(() => import('./em-dash-remover/EmDashRemover')),
  'double-line-remover': lazy(() => import('./double-line-remover/DoubleLineRemover')),
  'diff-checker': lazy(() => import('./diff-checker/DiffChecker')),
  'markdown-renderer': lazy(() => import('./markdown-renderer/MarkdownRenderer')),
  'mermaid-editor': lazy(() => import('./mermaid-editor/MermaidEditor')),
  'markdown-editor': lazy(() => import('./markdown-editor/MarkdownEditor')),
  'image-resize': lazy(() => import('./image-resize/ImageResize')),
  'background-remover': lazy(() => import('./background-remover/BackgroundRemover')),
  'bulk-file-hasher': lazy(() => import('./bulk-file-hasher/BulkFileHasher')),
  'bulk-file-renamer': lazy(() => import('./bulk-file-renamer/BulkFileRenamer')),
  'pdf-split': lazy(() => import('./pdf-split/PdfSplit')),
  'pdf-resize': lazy(() => import('./pdf-resize/PdfResize')),
  'pdf-to-image-markdown': lazy(() => import('./pdf-to-image-markdown/PdfToImageMarkdown')),
  'docx-to-html-markdown': lazy(() => import('./docx-to-html-markdown/DocxToHtmlMarkdown')),
  'docx-pdf': lazy(() => import('./docx-pdf/DocxPdf')),
  'pdf-merge': lazy(() => import('./pdf-merge/PdfMerge')),
  'pdf-page-organizer': lazy(() => import('./pdf-page-organizer/PdfPageOrganizer')),
}
