// apps/web/playwright.config.ts
//
// E2E config. Two project lanes:
//   * `chromium`         — public, anon paths (landing, auth, marketing)
//   * `chromium-auth`    — runs storageState=user.json from the auth setup
//
// `setup` is its own project that creates a real Supabase test user via the
// admin API, signs in once, and persists cookies — so auth-gated specs start
// already signed in and don't re-pay the round-trip cost.
//
// Run:
//   npm run test:e2e             — full suite, headless
//   npm run test:e2e -- --ui     — UI mode for debugging
//   npm run test:e2e -- --grep "landing"

import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PORT ?? 3000)
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`
const STORAGE_STATE = './e2e/.auth/user.json'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  outputDir: './e2e/.results',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'setup',
      testMatch: /fixtures\/test-user\.ts$/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.spec\.ts$/,
      testIgnore: /.*\.auth\.spec\.ts$/,
    },
    {
      name: 'chromium-auth',
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
      testMatch: /.*\.auth\.spec\.ts$/,
      dependencies: ['setup'],
    },
    // Cross-browser smoke (public only, keeps CI fast).
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: /landing\.spec\.ts$/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /landing\.spec\.ts$/,
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
