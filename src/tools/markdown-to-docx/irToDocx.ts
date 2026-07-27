import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type FileChild,
  type ILevelsOptions,
  type ParagraphChild,
} from 'docx'
import type { Block, InlineRun } from './mdToIr'

export interface ConvertOptions {
  /** Download http(s) images referenced in the markdown. Off = skipped + warning. */
  fetchRemoteImages: boolean
}

export interface ConvertOutcome {
  blob: Blob
  warnings: string[]
}

const HEADING = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const

const MONO = 'Consolas'
/** Max image width in the document, px (≈6.25 in at 96 dpi). */
const MAX_IMAGE_W = 600

type ImageType = 'png' | 'jpg' | 'gif' | 'bmp'
const IMAGE_TYPES: Record<string, ImageType> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
}

interface LoadedImage {
  data: ArrayBuffer
  type: ImageType
  width: number
  height: number
}

function collectImageSrcs(blocks: Block[]): Set<string> {
  const srcs = new Set<string>()
  const fromRuns = (runs: InlineRun[]) => {
    for (const r of runs) if (r.image) srcs.add(r.image.src)
  }
  for (const b of blocks) {
    if (b.kind === 'heading' || b.kind === 'paragraph') fromRuns(b.runs)
    if (b.kind === 'table') {
      b.header.forEach(fromRuns)
      b.rows.forEach((row) => row.forEach(fromRuns))
    }
  }
  return srcs
}

async function loadImages(
  blocks: Block[],
  opts: ConvertOptions,
  warnings: string[],
): Promise<Map<string, LoadedImage>> {
  const images = new Map<string, LoadedImage>()
  for (const src of collectImageSrcs(blocks)) {
    const short = src.length > 64 ? src.slice(0, 64) + '…' : src
    if (!src.startsWith('data:') && !/^https?:/i.test(src)) {
      warnings.push(`Image skipped (unsupported source): ${short}`)
      continue
    }
    if (/^https?:/i.test(src) && !opts.fetchRemoteImages) {
      warnings.push(`Web image skipped. Enable "fetch web images" to include it: ${short}`)
      continue
    }
    try {
      const blob = await (await fetch(src)).blob()
      const type = IMAGE_TYPES[blob.type]
      if (!type) {
        warnings.push(`Image skipped (format ${blob.type || 'unknown'} not supported): ${short}`)
        continue
      }
      const bitmap = await createImageBitmap(blob)
      let { width, height } = bitmap
      bitmap.close()
      if (width > MAX_IMAGE_W) {
        height = Math.round((height * MAX_IMAGE_W) / width)
        width = MAX_IMAGE_W
      }
      images.set(src, { data: await blob.arrayBuffer(), type, width, height })
    } catch {
      warnings.push(
        `Image could not be loaded (the server may block cross-site downloads): ${short}`,
      )
    }
  }
  return images
}

function textRun(r: InlineRun, forceBold: boolean): TextRun {
  return new TextRun({
    text: r.text ?? '',
    ...(r.break && { break: 1 }),
    ...((r.bold || forceBold) && { bold: true }),
    ...(r.italic && { italics: true }),
    ...(r.strike && { strike: true }),
    ...(r.code && {
      font: MONO,
      shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
    }),
    ...(r.link !== undefined && { style: 'Hyperlink' }),
  })
}

/** Runs → docx children; consecutive runs sharing a link merge into one hyperlink. */
function runsToChildren(
  runs: InlineRun[],
  images: Map<string, LoadedImage>,
  forceBold = false,
): ParagraphChild[] {
  const children: ParagraphChild[] = []
  let linkGroup: { href: string; runs: TextRun[] } | null = null

  const flushLink = () => {
    if (linkGroup) {
      children.push(new ExternalHyperlink({ link: linkGroup.href, children: linkGroup.runs }))
      linkGroup = null
    }
  }

  for (const r of runs) {
    if (r.image) {
      flushLink()
      const img = images.get(r.image.src)
      if (img) {
        children.push(
          new ImageRun({
            type: img.type,
            data: img.data,
            transformation: { width: img.width, height: img.height },
            altText: { title: r.image.alt, description: r.image.alt, name: r.image.alt },
          }),
        )
      } else if (r.image.alt) {
        children.push(new TextRun({ text: `[${r.image.alt}]`, italics: true }))
      }
      continue
    }
    if (r.link !== undefined) {
      if (linkGroup && linkGroup.href !== r.link) flushLink()
      linkGroup ??= { href: r.link, runs: [] }
      linkGroup.runs.push(textRun(r, forceBold))
    } else {
      flushLink()
      children.push(textRun(r, forceBold))
    }
  }
  flushLink()
  return children
}

function codeParagraph(text: string): Paragraph {
  const lines = text.split('\n')
  return new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' },
    spacing: { before: 120, after: 120 },
    children: lines.map(
      (line, i) => new TextRun({ text: line, font: MONO, size: 18, ...(i > 0 && { break: 1 }) }),
    ),
  })
}

function tableBlock(
  block: Extract<Block, { kind: 'table' }>,
  images: Map<string, LoadedImage>,
): Table {
  const cell = (runs: InlineRun[], head: boolean) =>
    new TableCell({
      ...(head && { shading: { type: ShadingType.CLEAR, fill: 'EFEFEF' } }),
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: runsToChildren(runs, images, head) })],
    })
  const rows = [
    ...(block.header.length > 0
      ? [new TableRow({ tableHeader: true, children: block.header.map((c) => cell(c, true)) })]
      : []),
    ...block.rows.map((r) => new TableRow({ children: r.map((c) => cell(c, false)) })),
  ]
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

const OL_LEVELS: ILevelsOptions[] = Array.from({ length: 6 }, (_, level) => ({
  level,
  format: LevelFormat.DECIMAL,
  text: `%${level + 1}.`,
  alignment: AlignmentType.START,
  style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
}))

/** Build the .docx blob from the block IR. */
export async function irToDocxBlob(blocks: Block[], opts: ConvertOptions): Promise<ConvertOutcome> {
  const warnings: string[] = []
  const images = await loadImages(blocks, opts, warnings)

  const orderedIds = new Set<number>()
  for (const b of blocks) {
    if (b.kind === 'paragraph' && b.list?.type === 'ordered') orderedIds.add(b.list.listId)
  }

  const children: FileChild[] = blocks.map((b) => {
    switch (b.kind) {
      case 'heading':
        return new Paragraph({
          heading: HEADING[b.level - 1],
          children: runsToChildren(b.runs, images),
        })
      case 'paragraph':
        return new Paragraph({
          children: runsToChildren(b.runs, images),
          ...(b.list?.type === 'bullet' && { bullet: { level: b.list.level } }),
          ...(b.list?.type === 'ordered' && {
            numbering: { reference: `md-ol-${b.list.listId}`, level: b.list.level },
          }),
          ...(b.indentLevel !== undefined && { indent: { left: 720 * b.indentLevel } }),
          ...(b.quote && {
            indent: { left: 480 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 18, color: 'BBBBBB', space: 8 },
            },
          }),
        })
      case 'code':
        return codeParagraph(b.text)
      case 'hr':
        return new Paragraph({ thematicBreak: true })
      case 'table':
        return tableBlock(b, images)
    }
  })

  const doc = new Document({
    numbering: {
      config: [...orderedIds].map((id) => ({ reference: `md-ol-${id}`, levels: OL_LEVELS })),
    },
    sections: [{ children }],
  })

  return { blob: await Packer.toBlob(doc), warnings }
}
