import { defineConfig, devices } from '@playwright/test'

/**
 * Cross-browser harness for the toolbox (Phase 61 part C).
 *
 * The `webServer` below serves the *existing* `dist/` through `vite preview`, so
 * run `npm run build` before `npm run e2e` — the specs assert on the production
 * bundle (service worker, lazy tool chunks), which `vite dev` does not produce.
 *
 * WebKit: Playwright's host-requirements validator fails on this machine (the
 * nine MiniBrowser libraries were installed by hand into
 * ~/.cache/ms-playwright/webkit-2336/minibrowser-wpe/sys/lib/ instead of through
 * apt, which the validator cannot see). WebKit itself launches and renders, so
 * the `e2e` npm script sets PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 to skip
 * that check. Use `npm run e2e` rather than `npx playwright test` directly.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/tools',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
})
