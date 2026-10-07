import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Download, Page } from '@playwright/test'
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib'
import {
  createFormFixture,
  createNoFormFixture,
  createXfaFixture,
} from '../src/tools/pdf-form-filler/fixtures'

async function downloadedPdf(download: Download) {
  const path = await download.path()
  if (!path) throw new Error('The PDF download was not saved.')
  return PDFDocument.load(await readFile(path), { updateMetadata: false })
}

async function upload(page: Page, bytes: Uint8Array, name = 'compliance-form.pdf') {
  await page
    .getByLabel('Choose a file', { exact: true })
    .setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) })
}

test('fills actual form fields, preserves editable values, and flattens the current inputs locally', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const requests: { method: string; url: string; body: boolean }[] = []
  const errors: string[] = []
  page.on('request', (request) =>
    requests.push({
      method: request.method(),
      url: request.url(),
      body: request.postDataBuffer() !== null,
    }),
  )
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tools/pdf-form-filler')
  const original = await createFormFixture()
  const initial = await PDFDocument.load(original, { updateMetadata: false })
  const fields = initial.getForm().getFields()
  const text = fields.find(
    (field): field is PDFTextField =>
      field instanceof PDFTextField && !field.isReadOnly() && !field.isMultiline(),
  )!
  const checkbox = fields.find((field): field is PDFCheckBox => field instanceof PDFCheckBox)!
  const radio = fields.find((field): field is PDFRadioGroup => field instanceof PDFRadioGroup)!
  const dropdown = fields.find((field): field is PDFDropdown => field instanceof PDFDropdown)!
  const list = fields.find((field): field is PDFOptionList => field instanceof PDFOptionList)!
  const radioChoice = radio.getOptions().at(-1)!
  const dropdownChoice = dropdown.getOptions().at(-1)!
  const listChoices = list.getOptions().filter((_, index) => index !== 1)
  await upload(page, original)
  await expect(page.getByRole('heading', { name: 'Form fields', exact: true })).toBeVisible()
  await page.getByLabel('Full name', { exact: true }).fill('Privacy reviewer')
  await page
    .getByRole('checkbox', { name: checkbox.getName(), exact: true })
    .setChecked(!checkbox.isChecked())
  await page.getByRole('radio', { name: radioChoice, exact: true }).check()
  await page.getByLabel(dropdown.getName(), { exact: true }).selectOption(dropdownChoice)
  await page.getByLabel(list.getName(), { exact: true }).selectOption(listChoices)
  const [filledDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download filled PDF', exact: true }).click(),
  ])
  expect(filledDownload.suggestedFilename()).toBe('compliance-form.filled.pdf')
  const filled = await downloadedPdf(filledDownload)
  const form = filled.getForm()
  expect(form.getTextField(text.getName()).getText()).toBe('Privacy reviewer')
  expect(form.getCheckBox(checkbox.getName()).isChecked()).toBe(!checkbox.isChecked())
  expect(form.getRadioGroup(radio.getName()).getSelected()).toBe(radioChoice)
  expect(form.getDropdown(dropdown.getName()).getSelected()).toEqual([dropdownChoice])
  expect(form.getOptionList(list.getName()).getSelected()).toEqual(listChoices)
  expect(form.getTextField(text.getName()).isReadOnly()).toBe(false)
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByLabel('Full name', { exact: true }).fill('Flattened reviewer')
  await expect(
    page.getByText('Inputs changed — update preview to see current values'),
  ).toBeVisible()
  const [flatDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download flattened PDF', exact: true }).click(),
  ])
  expect(flatDownload.suggestedFilename()).toBe('compliance-form.flattened.pdf')
  const flat = await downloadedPdf(flatDownload)
  expect(flat.getForm().getFields()).toEqual([])
  expect(flat.getPageCount()).toBe(initial.getPageCount())
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page.getByText(`Page 2 of ${initial.getPageCount()}`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset values', exact: true }).click()
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue(text.getText() ?? '')
  expect(errors).toEqual([])
  expect(
    requests.filter(
      (request) =>
        request.method !== 'GET' ||
        request.body ||
        !request.url.startsWith('http://127.0.0.1:4173/'),
    ),
  ).toEqual([])
})

test('recovers from invalid PDFs across service-worker takeover with an HTTP-cached worker', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  // Let the first real worker load before SW registration, as on a first visit.
  // Takeover must not break its next load through conditional HTTP-cache headers.
  await page.addInitScript(() => {
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker)
    const allowed = new Promise<void>((resolve) => {
      window.addEventListener('allow-service-worker', () => resolve(), { once: true })
    })
    navigator.serviceWorker.register = async (...args) => {
      await allowed
      return register(...args)
    }
  })
  await page.goto('/tools/pdf-form-filler')
  await upload(page, await createXfaFixture(), 'xfa.pdf')
  await expect(page.getByRole('alert')).toContainText('XFA')
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('allow-service-worker'))
    await navigator.serviceWorker.ready
  })
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await upload(page, await createNoFormFixture(), 'no-form.pdf')
  await expect(page.getByRole('alert')).toContainText(/no .*fields|no .*form/i)
  await upload(page, new TextEncoder().encode('not a PDF'), 'broken.pdf')
  await expect(page.getByRole('alert')).toContainText(/corrupted|not a PDF/i)
  await upload(page, await createFormFixture())
  await expect(page.getByRole('heading', { name: 'Form fields', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})
