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

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
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
