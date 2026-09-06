import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

test.describe.configure({ mode: 'parallel' })

/**
 * Console messages that are emitted by the browser itself (not by our code) and
 * carry no defect. Each entry needs a reason; nothing goes in here to silence a
 * real failure.
 */
const BENIGN_CONSOLE: string[] = []

function isBenign(text: string): boolean {
  return BENIGN_CONSOLE.some((allowed) => text.includes(allowed))
}

/** Collect console errors and uncaught page errors for the life of a page. */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!isBenign(text)) errors.push(`console.error: ${text}`)
  })
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`)
  })
  return errors
}

interface ToolLink {
  slug: string
  name: string
}

/** Read the tool list off the dashboard so the spec never duplicates the registry. */
async function readToolLinks(page: Page): Promise<ToolLink[]> {
  await page.goto('/tools')
  const cards = page.locator('[data-tool-card]')
  await expect(cards.first()).toBeVisible()
  return cards.evaluateAll((nodes) =>
    nodes.map((node) => {
      const href = node.getAttribute('href') ?? ''
      return {
        slug: href.split('/').pop() ?? '',
        name: node.querySelector('h3')?.textContent?.trim() ?? '',
      }
    }),
  )
}

test.describe('dashboard', () => {
  test('lists every tool card', async ({ page }) => {
    const links = await readToolLinks(page)
    expect(links.length).toBeGreaterThanOrEqual(50)
    expect(links.every((l) => l.slug !== '' && l.name !== '')).toBe(true)
  })

  test('search box carries the platform shortcut hint', async ({ page, isMobile }) => {
    await page.goto('/tools')
    const input = page.locator('#tool-search')
    await expect(input).toBeVisible()
    // The hint is hidden below the `sm` breakpoint (390px mobile project).
    const hint = page.locator('#tool-search ~ div kbd')
    const text = (await hint.textContent())?.trim()
    expect(text === '⌘ K' || text === 'Ctrl K').toBe(true)
    if (!isMobile) await expect(hint).toBeVisible()
  })

  test('typing ranks matching tools', async ({ page }) => {
    await page.goto('/tools')
    await page.locator('#tool-search').fill('hash')
    await expect(page.locator('p[aria-live="polite"]')).toHaveText(/\d+ tools? match/)
    const first = page.locator('[data-tool-card]').first()
    await expect(first.locator('h3')).toHaveText('Bulk file hasher')
  })

  test('deep-links a query through ?q=', async ({ page }) => {
    await page.goto('/tools?q=excel')
    await expect(page.locator('[data-tool-card]').first()).toBeVisible()
    const names = await page.locator('[data-tool-card] h3').allTextContents()
    expect(names.some((n) => n.toLowerCase().includes('xlsx'))).toBe(true)
  })

  test('a category chip narrows the sections', async ({ page }) => {
    await page.goto('/tools')
    const cards = page.locator('[data-tool-card]')
    await expect(cards.first()).toBeVisible()
    const all = await cards.count()
    await page.getByRole('button', { name: 'PDF & Office', exact: true }).click()
    await expect(page).toHaveURL(/category=/)
    await expect(cards.first()).toBeVisible()
    const narrowed = await cards.count()
    expect(narrowed).toBeGreaterThan(0)
    expect(narrowed).toBeLessThan(all)
  })

  test('Ctrl+K focuses the search from a tool page', async ({ page }) => {
    await page.goto('/tools/diff-checker')
    await expect(page.locator('[data-tool-title]')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+KeyK')
    await expect(page).toHaveURL(/\/tools$/)
    await expect(page.locator('#tool-search')).toBeFocused()
  })

  test('? opens the shortcuts dialog and Esc closes it', async ({ page }) => {
    await page.goto('/tools')
    // The global listener is attached when the toolbox Shell mounts; pressing
    // before that silently does nothing.
    await expect(page.locator('[data-tool-card]').first()).toBeVisible()
    await page.locator('body').click()
    await page.keyboard.press('Shift+Slash')
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('Shift+D toggles the dark class', async ({ page }) => {
    await page.goto('/tools')
    await expect(page.locator('[data-tool-card]').first()).toBeVisible()
    await page.locator('body').click()
    const html = page.locator('html')
    const before = await html.evaluate((el) => el.classList.contains('dark'))
    await page.keyboard.press('Shift+KeyD')
    await expect.poll(() => html.evaluate((el) => el.classList.contains('dark'))).toBe(!before)
  })
})

/**
 * The 54 tool routes are swept in fixed shards so the work spreads over
 * Playwright's workers (the slug list can only be read at run time, so a test
 * per tool is not possible without duplicating the registry here).
 */
const SHARDS = 6

test.describe('every tool page', () => {
  for (let shard = 0; shard < SHARDS; shard++) {
    test(`shard ${shard + 1}/${SHARDS} loads cleanly`, async ({ page }) => {
      test.setTimeout(240_000)
      await sweep(page, shard)
    })
  }
})

async function sweep(page: Page, shard: number): Promise<void> {
  const all = await readToolLinks(page)
  const links = all.filter((_, index) => index % SHARDS === shard)
  const failures: string[] = []

  for (const { slug } of links) {
    const errors = watchErrors(page)
    try {
      await page.goto(`/tools/${slug}`, { timeout: 15_000 })
      // ToolLayout's own <h1> — a few tools render user content that contains
      // further h1s (the markdown preview), and several page titles are longer
      // than the dashboard card label, so this asserts the frame rendered
      // rather than comparing against the card text.
      await expect(page.locator('[data-tool-title]')).not.toBeEmpty({ timeout: 15_000 })
      // Let effects, workers and lazy imports settle before reading errors and
      // before navigating away: a dynamic import that is still in flight when
      // the next navigation starts is aborted, and Firefox reports the aborted
      // service-worker fetch as a console error.
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
      await page.waitForTimeout(300)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      if (overflow > 0) failures.push(`${slug}: horizontal overflow by ${overflow}px`)
    } catch (error) {
      failures.push(`${slug}: ${(error as Error).message.split('\n')[0]}`)
    }
    for (const message of errors) failures.push(`${slug}: ${message}`)
    page.removeAllListeners('console')
    page.removeAllListeners('pageerror')
  }

  expect(failures, failures.join('\n')).toEqual([])
}
