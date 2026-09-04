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
  'image-format-converter': lazy(() => import('./image-format-converter/ImageFormatConverter')),
  'image-compressor': lazy(() => import('./image-compressor/ImageCompressor')),
  'crop-rotate-flip': lazy(() => import('./crop-rotate-flip/CropRotateFlip')),
  'exif-viewer': lazy(() => import('./exif-viewer/ExifViewer')),
  'svg-optimizer': lazy(() => import('./svg-optimizer/SvgOptimizer')),
  'favicon-generator': lazy(() => import('./favicon-generator/FaviconGenerator')),
  'color-palette-extractor': lazy(() => import('./color-palette-extractor/ColorPaletteExtractor')),
  'bulk-file-hasher': lazy(() => import('./bulk-file-hasher/BulkFileHasher')),
  'bulk-file-renamer': lazy(() => import('./bulk-file-renamer/BulkFileRenamer')),
  'zip-unzip': lazy(() => import('./zip-unzip/ZipUnzip')),
  'pdf-split': lazy(() => import('./pdf-split/PdfSplit')),
  'pdf-resize': lazy(() => import('./pdf-resize/PdfResize')),
  'pdf-to-image-markdown': lazy(() => import('./pdf-to-image-markdown/PdfToImageMarkdown')),
  'docx-to-html-markdown': lazy(() => import('./docx-to-html-markdown/DocxToHtmlMarkdown')),
  'docx-pdf': lazy(() => import('./docx-pdf/DocxPdf')),
  'pdf-merge': lazy(() => import('./pdf-merge/PdfMerge')),
  'pdf-page-organizer': lazy(() => import('./pdf-page-organizer/PdfPageOrganizer')),
  'pdf-watermark': lazy(() => import('./pdf-watermark/PdfWatermark')),
  'images-to-pdf': lazy(() => import('./images-to-pdf/ImagesToPdf')),
  'pdf-compress': lazy(() => import('./pdf-compress/PdfCompress')),
  'xlsx-csv-viewer': lazy(() => import('./xlsx-csv-viewer/XlsxCsvViewer')),
  'markdown-to-docx': lazy(() => import('./markdown-to-docx/MarkdownToDocx')),
  'json-formatter': lazy(() => import('./json-formatter/JsonFormatter')),
  'yaml-json-toml': lazy(() => import('./yaml-json-toml/YamlJsonToml')),
  'csv-json': lazy(() => import('./csv-json/CsvJson')),
  base64: lazy(() => import('./base64/Base64')),
  'url-encode': lazy(() => import('./url-encode/UrlEncode')),
  'regex-tester': lazy(() => import('./regex-tester/RegexTester')),
  'word-counter': lazy(() => import('./word-counter/WordCounter')),
  'uuid-password-generator': lazy(() => import('./uuid-password-generator/UuidPasswordGenerator')),
  'timestamp-converter': lazy(() => import('./timestamp-converter/TimestampConverter')),
  'string-escape': lazy(() => import('./string-escape/StringEscape')),
  'text-hasher': lazy(() => import('./text-hasher/TextHasher')),
  'jwt-decoder': lazy(() => import('./jwt-decoder/JwtDecoder')),
  'certificate-decoder': lazy(() => import('./certificate-decoder/CertificateDecoder')),
  'hex-viewer': lazy(() => import('./hex-viewer/HexViewer')),
  'password-strength': lazy(() => import('./password-strength/PasswordStrength')),
  'qr-generator-reader': lazy(() => import('./qr-generator-reader/QrGeneratorReader')),
}
