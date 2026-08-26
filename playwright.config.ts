import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

const authFile = (role: string) => `./.auth/${role}.json`

export default defineConfig({
  testDir: './e2e/specs',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  /**
   * `@live` specs are excluded from every ordinary run.
   *
   * There is exactly one: the acceptance check that asks the REAL geocoding
   * provider whether the address the client reported resolves. It is the only
   * thing that would notice an expired API key or a provider regression, and it
   * is also the only thing in the suite that depends on a third party being up
   * and costs money per run. So it belongs on a schedule, not on a pull request.
   *
   *   npx playwright test --grep @live
   */
  grepInvert: process.env.E2E_INCLUDE_LIVE ? undefined : /@live/,

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    /**
     * Emulate "reduce motion" for every test.
     *
     * `globals.css` sets `scroll-behavior: smooth` on `html`. Playwright scrolls
     * an element into view before clicking it and then waits for it to be
     * STABLE, so a smooth scroll means the target is still moving when the
     * check runs. On a control far enough down the admin modal to need
     * scrolling, that spent the whole 30s budget and failed on Firefox while
     * passing on Chromium — a difference in scroll timing, not in the app.
     *
     * This is not a workaround bolted on for the tests: `globals.css` already
     * has a `prefers-reduced-motion: reduce` block that turns off smooth
     * scrolling and collapses every animation, written for users who asked
     * their OS for it. Opting the suite into that same path removes the
     * flakiness and makes the run faster, without changing what ships.
     *
     * Nested under `contextOptions`, not set directly on `use`. On this version
     * `reducedMotion` lives on `BrowserContextOptions`; putting it at the top
     * level type-checks as an unknown key that Playwright then ignores, so the
     * emulation silently never happens and the flake stays. `npx tsc --noEmit`
     * is what caught that — the suite gave no hint.
     */
    contextOptions: { reducedMotion: 'reduce' },
    // Both budgets are sized for the webServer being `next dev`, which compiles
    // a route the first time it is requested. Whichever spec happens to touch a
    // route first pays for that build, so the same spec passes when its project
    // runs alone and fails in a full cold run purely because the order changed.
    //
    // `test.slow()` rescues neither of these: it scales the per-test timeout,
    // not the action or navigation ones.

    // The first click on a freshly compiled page waits for the build: 15s was
    // not enough for "New Clinic" on a cold `/admin/clinics` (~20s to compile).
    actionTimeout: 30_000,
    // `/admin/dashboard` (recharts + the bento widgets) compiles in 15.2s and
    // the navigation measured 24.6s, over the old 30s budget — which failed
    // `role-guard.spec.ts` for a reason that has nothing to do with role
    // guarding.
    navigationTimeout: 90_000,
  },

  globalSetup: './e2e/global.setup.ts',
  globalTeardown: './e2e/global.teardown.ts',

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'public',
      testMatch: /(public|auth)[\\/](?!role-guard).*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-role-guard',
      testMatch: /auth[\\/]role-guard\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-admin',
      testMatch: /admin[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: authFile('admin') },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-lawyer',
      testMatch: /lawyer[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: authFile('lawyer') },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-clinic',
      testMatch: /clinic[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: authFile('clinic') },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-referrer',
      testMatch: /referrer[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: authFile('referrer') },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-partner',
      testMatch: /partner[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: authFile('partner') },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-directory',
      testMatch: /directory[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: authFile('directory') },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-edge',
      testMatch: /edge-cases[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'firefox-smoke',
      testMatch: /admin[\\/]clinics-create-edit\.spec\.ts/,
      use: { ...devices['Desktop Firefox'], storageState: authFile('admin') },
      dependencies: ['setup'],
    },
    {
      name: 'webkit-smoke',
      testMatch: /clinic[\\/]refer-to-specialist\.spec\.ts/,
      use: { ...devices['Desktop Safari'], storageState: authFile('clinic') },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
