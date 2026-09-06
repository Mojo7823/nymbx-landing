import { expect, test } from '@playwright/test'

/**
 * Chromium only: Firefox and WebKit do not route service-worker navigations
 * reliably under Playwright's offline emulation (WebKit throws "WebKit
 * encountered an internal error" on any navigation after setOffline(true)), so
 * the offline assertions can only be made in Chromium. This is a harness
 * limitation, not a site defect.
 */
test.describe('PWA and offline', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'offline emulation is Chromium-only')

  test('serves a manifest with the three icons', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.status()).toBe(200)
    const manifest = (await response.json()) as {
      icons: { src: string; sizes: string; purpose?: string }[]
    }
    expect(manifest.icons).toHaveLength(3)
    const sources = manifest.icons.map((icon) => icon.src)
    expect(sources.some((src) => src.includes('pwa-192'))).toBe(true)
    expect(sources.some((src) => src.includes('pwa-512'))).toBe(true)
    expect(sources.some((src) => src.includes('pwa-maskable-512'))).toBe(true)
  })

  test('registers a service worker and keeps opened tools working offline', async ({
    page,
    context,
  }) => {
    await page.goto('/tools')
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, {
      timeout: 20_000,
    })
    const cacheNames = await page.evaluate(() => caches.keys())
    expect(cacheNames.some((name) => name.includes('workbox-precache'))).toBe(true)

    // Visiting a tool pulls its chunk into the runtime asset cache.
    await page.goto('/tools/diff-checker')
    await expect(page.locator('[data-tool-title]')).toHaveText('Diff checker')
    await page.waitForTimeout(1000)

    await context.setOffline(true)

    await page.goto('/tools')
    await expect(page.locator('[data-tool-card]').first()).toBeVisible()
    // Precached responses keep their COOP/COEP headers.
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true)

    await page.goto('/tools/diff-checker')
    await expect(page.locator('[data-tool-title]')).toHaveText('Diff checker')

    // A tool that was never opened has no cached chunk: the boundary must show
    // a friendly message instead of a blank screen. Which of the two messages
    // it picks depends on navigator.onLine, and Playwright's offline emulation
    // leaves that `true` for a page loaded after setOffline(true), so both
    // wordings are accepted here.
    await page.goto('/tools/pdf-merge')
    await expect(
      page.getByText(/This tool hasn't been downloaded yet\.|This page failed to load\./),
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()

    await context.setOffline(false)
  })
})
