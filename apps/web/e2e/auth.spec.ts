// apps/web/e2e/auth.spec.ts
// Sign-in form smoke tests. Doesn't actually mint a session here — that lives
// in fixtures/test-user.ts which the auth-gated specs depend on.

import { test, expect } from '@playwright/test'

test.describe('Auth pages (public)', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.getByPlaceholder(/you@example/i)).toBeVisible()
    await expect(page.getByPlaceholder(/••/)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign in|log in|continue/i })).toBeVisible()
  })

  test('login pre-fills nothing but accepts ?seed= for chat seeding', async ({ page }) => {
    await page.goto('/auth/login?seed=Hello%20there')
    // The seed param is consumed post-login by /api/threads to start the
    // conversation. We just sanity-check the URL flowed through.
    expect(new URL(page.url()).searchParams.get('seed')).toBe('Hello there')
  })

  test('register page renders if available', async ({ page }) => {
    const res = await page.goto('/auth/register', { waitUntil: 'domcontentloaded' })
    if (res?.status() === 404) test.skip(true, 'register route not present in this build')
    await expect(page.getByPlaceholder(/you@example/i)).toBeVisible()
  })

  test('gated routes redirect anon visitors to login', async ({ page }) => {
    for (const path of ['/search', '/analytics', '/alerts', '/settings']) {
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' })
      // Either we ended up on /auth/login or on a 404 (route may not exist in this build).
      // Critical contract: we did NOT silently render the protected page.
      if (res?.status() === 404) continue
      const u = page.url()
      const onLandingOrAuth =
        /\/auth\/(?:login|register)(?:[?#]|$)/.test(u) ||
        /^https?:\/\/[^/]+\/?(?:[?#]|$)/.test(u)
      expect(onLandingOrAuth).toBe(true)
    }
  })
})
