import { expect, test } from '@playwright/test'

test('homepage, legacy links, and about navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Every tool. One tab.' })).toBeVisible()
  await expect(page.locator('[data-tool-card]').first()).toBeVisible()
  await page.getByRole('link', { name: 'About', exact: true }).click()
  await expect(page).toHaveURL(/\/about$/)
  await expect(page.locator('#projects')).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://nymbx.dev/about',
  )
  await page.goto('/tools?q=hash#files')
  await expect(page).toHaveURL(/\/\?q=hash#files$/)
  await expect(page.getByRole('searchbox')).toHaveValue('hash')
  await page.goto('/tools/markdown-editor')
  await page.getByRole('link', { name: 'All tools', exact: true }).click()
  await expect(page).toHaveURL('http://127.0.0.1:4173/')
})

for (const slug of ['markdown-editor', 'markdown-renderer']) {
  test(`${slug}: focus preview preserves content, blocks XSS, and keeps files local`, async ({
    page,
  }) => {
    const marker = 'PRIVATE_MARKDOWN_CONTENT_8a83'
    const markdown = `# ${marker}\n\nA **local** document.\n\n<script>window.__xss = true</script>\n<img src=x onerror="window.__xss = true">\n[bad](javascript:alert(1))`
    const leaks: string[] = []
    page.on('request', (request) => {
      if (`${request.url()}${request.postData() ?? ''}`.includes(marker)) leaks.push(request.url())
    })
    await page.goto(`/tools/${slug}`)
    const source = page.getByRole('textbox', { name: 'Markdown source' })
    await expect(source).toBeVisible()
    if (slug === 'markdown-editor') {
      await page.locator('input[type=file][accept^=".md"]').setInputFiles({
        name: 'private.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from(markdown),
      })
    } else {
      await source.fill(markdown)
    }
    const preview = page.locator('.markdown-preview-pane')
    await expect(preview.getByRole('heading', { name: marker })).toBeVisible()
    const focus = page.getByRole('button', { name: 'Focus preview', exact: true })
    await focus.click()
    const dialog = page.getByRole('dialog', { name: 'Focused Markdown preview' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: marker })).toBeVisible()
    await expect(dialog.locator('script, [onerror], a[href^="javascript:"]')).toHaveCount(0)
    expect(await page.evaluate(() => '__xss' in window)).toBe(false)
    expect(
      await dialog.evaluate((el) => ({ width: el.clientWidth, height: el.clientHeight })),
    ).toEqual(await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(page).toHaveURL(new RegExp(`/tools/${slug}$`))
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(focus).toBeFocused()
    await expect(preview.getByRole('heading', { name: marker })).toBeVisible()
    if (slug === 'markdown-editor') await expect(source).toContainText(marker)
    else await expect(source).toHaveValue(markdown)
    await focus.click()
    await page.getByRole('button', { name: 'Exit focus preview' }).click()
    await expect(dialog).toBeHidden()
    expect(leaks).toEqual([])
  })
}

test('mobile categories trap focus, close with Escape, and navigate home', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tools/markdown-renderer')
  const opener = page.getByRole('button', { name: 'Open category navigation' })
  await opener.click()
  const drawer = page.getByRole('dialog', { name: 'Category navigation' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Close navigation' })).toBeFocused()
  // Modal background is inert, even when a script attempts to focus it.
  await page.getByRole('link', { name: 'All tools', exact: true }).evaluate((el) => el.focus())
  await expect(drawer.getByRole('button', { name: 'Close navigation' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(opener).toBeFocused()
  await opener.click()
  await drawer.getByRole('link', { name: 'Markdown' }).click()
  await expect(page).toHaveURL(/\/#markdown$/)
  await expect(drawer).toBeHidden()
  await expect(page.getByRole('searchbox')).toBeVisible()
})
