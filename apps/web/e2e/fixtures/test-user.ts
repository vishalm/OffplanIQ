// apps/web/e2e/fixtures/test-user.ts
//
// Authenticated-user setup. We create (or reuse) a Supabase test user via the
// service role, then sign in via the public auth flow and persist the session
// cookies to a state file. Specs that need auth use `test.use({ storageState })`
// to start already signed in.
//
// Reads SUPABASE creds from .env at the workspace root.

import { test as setup, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STORAGE_STATE = resolve(__dirname, '../.auth/user.json')

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const txt = readFileSync(resolve(__dirname, '../../../../', file), 'utf8')
      for (const line of txt.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
      }
    } catch { /* file optional */ }
  }
}
loadEnv()

const TEST_EMAIL    = process.env.E2E_TEST_EMAIL    || 'e2e-test@offplaniq.test'
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'e2e-test-password-123!'

setup('create + sign in test user', async ({ page, request }) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set in .env for auth setup.')
  }

  // 1. Idempotent user creation via the admin API. If it already exists we
  //    swallow the error and proceed to sign-in.
  const createRes = await request.post(`${url}/auth/v1/admin/users`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    data: { email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true },
  })
  // 422 = already exists. Anything else worth surfacing.
  expect([200, 201, 422]).toContain(createRes.status())

  // 2. Sign in via the public form, just like a real user. This sets the
  //    Supabase auth cookies on `page`.
  await page.goto('/auth/login')
  await page.getByLabel(/email/i).fill(TEST_EMAIL)
  await page.getByLabel(/password/i).fill(TEST_PASSWORD)
  await Promise.all([
    page.waitForURL(/\/(search|analytics|ask|projects|alerts|$)/),
    page.getByRole('button', { name: /sign in|log in|continue/i }).click(),
  ])

  // 3. Persist session cookies for downstream specs.
  await page.context().storageState({ path: STORAGE_STATE })
})
