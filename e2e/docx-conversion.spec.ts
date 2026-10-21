import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>'

function imageDocument() {
  const word = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships'
  return zipSync({
    '[Content_Types].xml': strToU8(
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<Relationships xmlns="${relationships}"><Relationship Id="root" Type="${rel}/officeDocument" Target="word/document.xml"/></Relationships>`,
    ),
    'word/document.xml': strToU8(
      `<w:document xmlns:w="${word}" xmlns:r="${rel}"><w:body><w:p><w:r><w:t>PRIVATE_DOCX_IMAGE_PREVIEW</w:t></w:r></w:p><w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="304800" cy="304800"/><wp:docPr id="1" name="Red square"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="red.svg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="image"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="304800" cy="304800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>`,
    ),
    'word/_rels/document.xml.rels': strToU8(
      `<Relationships xmlns="${relationships}"><Relationship Id="image" Type="${rel}/image" Target="media/red.svg"/></Relationships>`,
    ),
    'word/media/red.svg': strToU8(SVG),
  })
}

test('separate DOCX images remain visible locally and ZIP exports retain portable image paths', async ({
  page,
}) => {
  const requests: { url: string; body: boolean }[] = []
  page.on('request', (request) =>
    requests.push({ url: request.url(), body: request.postDataBuffer() !== null }),
  )
  await page.goto('/tools/docx-to-html-markdown')
  await page.getByLabel('Choose a file', { exact: true }).setInputFiles({
    name: 'image.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(imageDocument()),
  })
  const image = page.locator('.md-preview img')
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(32)
  await page.getByRole('radio', { name: 'Separate files (zip)', exact: true }).check()
  await expect(
    page.getByRole('button', { name: 'Download .html (zip)', exact: true }),
  ).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(32)
  const pixel = await image.evaluate(async (img: HTMLImageElement) => {
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 32
    const context = canvas.getContext('2d')!
    context.drawImage(img, 0, 0)
    return Array.from(context.getImageData(16, 16, 1, 1).data)
  })
  expect(pixel).toEqual([255, 0, 0, 255])
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download .html (zip)', exact: true }).click(),
  ])
  const path = await download.path()
  if (!path) throw new Error('The ZIP download was not saved.')
  const entries = unzipSync(await readFile(path))
  const html = strFromU8(entries['image.html']!)
  const imagePath = /<img[^>]* src="([^"]+)"/.exec(html)?.[1]
  expect(imagePath).toBeDefined()
  expect(strFromU8(entries[imagePath!]!)).toBe(SVG)
  await page.getByRole('tab', { name: 'HTML', exact: true }).click()
  await page.getByRole('tab', { name: 'Preview', exact: true }).click()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(32)
  await page.getByRole('radio', { name: 'Embed as base64', exact: true }).check()
  await expect(page.getByRole('button', { name: 'Download .html', exact: true })).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(32)
  expect(
    requests.filter(
      (request) =>
        request.body ||
        request.url.includes('PRIVATE_DOCX_IMAGE_PREVIEW') ||
        new URL(request.url).pathname.startsWith('/tools/images/'),
    ),
  ).toEqual([])
})
