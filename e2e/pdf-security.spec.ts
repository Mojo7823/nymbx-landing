import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Download, Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { createFormFixture } from '../src/tools/pdf-form-filler/fixtures'

async function upload(page: Page, bytes: Uint8Array, name: string) {
  await page.getByLabel('Choose a file', { exact: true }).setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from(bytes),
  })
}

async function downloadedBytes(download: Download) {
  const path = await download.path()
  if (!path) throw new Error('The PDF download was not saved.')
  return readFile(path)
}

test('protects a real form, rejects a wrong password and unlocks without losing editable fields', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const openingPassword = '密'.repeat(42) + 'a' // Exactly 127 UTF-8 bytes.
  const requests: { method: string; url: string; body: boolean }[] = []
  const pageErrors: string[] = []
  page.on('request', (request) =>
    requests.push({
      method: request.method(),
      url: request.url(),
      body: request.postDataBuffer() !== null,
    }),
  )
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/tools/pdf-security')
  await upload(page, await createFormFixture(), 'review.pdf')
  await page.getByRole('radio', { name: 'Protect PDF', exact: true }).check()
  await page.getByLabel('Opening password', { exact: true }).fill(openingPassword)
  await page.getByLabel('Owner password', { exact: true }).fill('private-owner-64')
  await page.getByLabel('Printing', { exact: true }).selectOption('low')
  await page.getByLabel('Changes', { exact: true }).selectOption('form')
  await page.getByRole('checkbox', { name: 'Allow copying text and images', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Protect PDF', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Download protected PDF', exact: true }),
  ).toBeVisible({ timeout: 30_000 })
  const [protectedDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download protected PDF', exact: true }).click(),
  ])
  expect(protectedDownload.suggestedFilename()).toBe('review.protected.pdf')
  const protectedBytes = await downloadedBytes(protectedDownload)
  await expect(PDFDocument.load(protectedBytes)).rejects.toThrow(/encrypted/i)
  await page.getByLabel('Opening password', { exact: true }).fill('changed-password')
  await expect(
    page.getByRole('button', { name: 'Download protected PDF', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Change PDF', exact: true }).click()
  await upload(page, protectedBytes, 'review.protected.pdf')
  await page.getByLabel('Current PDF password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Unlock PDF', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(/incorrect|invalid|wrong/i, {
    timeout: 30_000,
  })
  await expect(
    page.getByRole('button', { name: 'Download unlocked PDF', exact: true }),
  ).toHaveCount(0)
  await page.getByLabel('Current PDF password', { exact: true }).fill(openingPassword)
  await page.getByRole('button', { name: 'Unlock PDF', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Download unlocked PDF', exact: true }),
  ).toBeVisible({ timeout: 30_000 })
  const [unlockedDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download unlocked PDF', exact: true }).click(),
  ])
  expect(unlockedDownload.suggestedFilename()).toBe('review.protected.unlocked.pdf')
  const unlocked = await PDFDocument.load(await downloadedBytes(unlockedDownload))
  const form = unlocked.getForm()
  expect(unlocked.getPageCount()).toBe(2)
  expect(form.getTextField('fullName').getText()).toBe('Alice Example')
  expect(form.getTextField('accountId').getText()).toBe('ACCOUNT-007')
  expect(form.getTextField('accountId').isReadOnly()).toBe(true)
  expect(form.getCheckBox('subscribed').isChecked()).toBe(true)
  expect(form.getRadioGroup('contact').getSelected()).toBe('Email')
  expect(form.getDropdown('country').getSelected()).toEqual(['Taiwan'])
  expect(form.getOptionList('languages').getSelected()).toEqual(['English', 'Chinese'])
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click()
  await expect(page.getByLabel('Current PDF password', { exact: true })).toHaveValue('')
  await expect(
    page.getByRole('button', { name: 'Download unlocked PDF', exact: true }),
  ).toHaveCount(0)
  expect(pageErrors).toEqual([])
  expect(
    requests.filter(
      (request) =>
        request.method !== 'GET' ||
        request.body ||
        (!request.url.startsWith('http://127.0.0.1:4173/') &&
          !request.url.startsWith('blob:http://127.0.0.1:4173/')),
    ),
  ).toEqual([])
})

test('rejects a corrupt PDF, clears its error and processes a different original', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.goto('/tools/pdf-security')
  await upload(page, new TextEncoder().encode('%PDF-1.7\nBROKEN XREF\n%%EOF'), 'broken.pdf')
  await page.getByRole('button', { name: 'Unlock PDF', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(/corrupt|valid PDF|read/i, {
    timeout: 30_000,
  })
  await page.getByRole('button', { name: 'Change PDF', exact: true }).click()
  await upload(page, await createFormFixture(), 'fresh.pdf')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Unlock PDF', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Download unlocked PDF', exact: true }),
  ).toBeVisible({ timeout: 30_000 })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download unlocked PDF', exact: true }).click(),
  ])
  expect(download.suggestedFilename()).toBe('fresh.unlocked.pdf')
  const pdf = await PDFDocument.load(await downloadedBytes(download))
  expect(pdf.getForm().getTextField('fullName').getText()).toBe('Alice Example')
  await page.getByRole('button', { name: 'Change PDF', exact: true }).click()
  await expect(page.getByLabel('Current PDF password', { exact: true })).toHaveValue('')
  await expect(
    page.getByRole('button', { name: 'Download unlocked PDF', exact: true }),
  ).toHaveCount(0)
})

test('unlocks legacy Unicode passwords and upgrades encrypted originals to AES-256', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const legacy = await readFile(new URL('./fixtures/pdf-security-legacy.pdf', import.meta.url))
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tools/pdf-security')
  await upload(page, legacy, 'legacy.pdf')
  await page.getByLabel('Current PDF password', { exact: true }).fill('café legacy')
  await page.getByRole('button', { name: 'Unlock PDF', exact: true }).click()
  const unlocked = page.getByRole('button', { name: 'Download unlocked PDF', exact: true })
  await expect(unlocked).toBeVisible({ timeout: 30_000 })
  const [plainDownload] = await Promise.all([page.waitForEvent('download'), unlocked.click()])
  const plain = await PDFDocument.load(await downloadedBytes(plainDownload))
  expect(plain.getForm().getTextField('fullName').getText()).toBe('Alice Example')
  expect(plain.getForm().getTextField('accountId').isReadOnly()).toBe(true)

  await page.getByRole('button', { name: 'Change PDF', exact: true }).click()
  await upload(page, legacy, 'legacy.pdf')
  await page.getByRole('radio', { name: 'Protect PDF', exact: true }).check()
  await page.getByLabel('Current PDF password', { exact: true }).fill('café legacy')
  await page.getByLabel('Opening password', { exact: true }).fill('upgraded-open-64')
  await page.getByLabel('Owner password', { exact: true }).fill('upgraded-owner-64')
  await page.getByRole('button', { name: 'Protect PDF', exact: true }).click()
  const protectedDownload = page.getByRole('button', {
    name: 'Download protected PDF',
    exact: true,
  })
  await expect(protectedDownload).toBeVisible({ timeout: 30_000 })
  const [encryptedDownload] = await Promise.all([
    page.waitForEvent('download'),
    protectedDownload.click(),
  ])
  const encryptedBytes = await downloadedBytes(encryptedDownload)
  await expect(PDFDocument.load(encryptedBytes)).rejects.toThrow(/encrypted/i)

  await page.getByRole('button', { name: 'Change PDF', exact: true }).click()
  await upload(page, encryptedBytes, 'upgraded.pdf')
  await page.getByLabel('Current PDF password', { exact: true }).fill('upgraded-open-64')
  await page.getByRole('button', { name: 'Unlock PDF', exact: true }).click()
  await expect(unlocked).toBeVisible({ timeout: 30_000 })
  const [finalDownload] = await Promise.all([page.waitForEvent('download'), unlocked.click()])
  const final = await PDFDocument.load(await downloadedBytes(finalDownload))
  expect(final.getPageCount()).toBe(2)
  expect(final.getForm().getTextField('fullName').getText()).toBe('Alice Example')
  expect(final.getForm().getTextField('accountId').isReadOnly()).toBe(true)
  expect(errors).toEqual([])
})
