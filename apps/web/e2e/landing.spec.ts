// apps/web/e2e/landing.spec.ts
//
// The landing page is the front door of the AI-first product. It must:
//   1. Render fast with no nav chrome above the fold
//   2. Show the prompt input + suggestion chips
//   3. Anonymous submit → redirect to /auth/login carrying the prompt as ?seed=
//   4. Suggestion chip click → /auth/login?seed=<that prompt>

import { test, expect } from '@playwright/test'

test.describe('Landing page (public)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('renders hero, prompt input, and suggestion chips', async ({ page }) => {
    await expect(page).toHaveTitle(/OffplanIQ/i)
    await expect(page.getByRole('heading', { name: /the market knows/i })).toBeVisible()
    await expect(page.getByPlaceholder(/ask about projects/i)).toBeVisible()

    // Suggestion chips — at least 3 visible.
    const chips = page.locator('a').filter({ hasText: /Dubai|JVC|Compare|launched|IRR|Sobha/i })
    expect(await chips.count()).toBeGreaterThanOrEqual(3)
  })

  test('header shows brand and a Sign in / Start CTA', async ({ page }) => {
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /start/i })).toBeVisible()
  })

  test('clicking a suggestion redirects anon to /auth/login with seed param', async ({ page }) => {
    const chip = page.locator('a', { hasText: /handing over/i }).first()
    const target = await chip.getAttribute('href')
    expect(target).toContain('/auth/login?seed=')
    await chip.click()
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page).toHaveURL(/seed=/)
  })

  test('submitting prompt anon → /auth/login carrying the prompt', async ({ page }) => {
    const input = page.getByPlaceholder(/ask about projects/i)
    await input.fill('Best 1BR under 1.5M in Business Bay')
    await Promise.all([
      page.waitForURL(/\/auth\/login/),
      page.getByRole('button', { name: /^send$/i }).click(),
    ])
    expect(page.url()).toContain('seed=')
    expect(decodeURIComponent(new URL(page.url()).search)).toContain('Business Bay')
  })

  test('proof points strip renders', async ({ page }) => {
    for (const label of ['DLD freshness', 'Every claim', 'Launches & moves', 'Native currency']) {
      await expect(page.getByText(label, { exact: false })).toBeVisible()
    }
  })

  test('no console errors on landing', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/', { waitUntil: 'networkidle' })
    // Tolerate 3rd-party noise (analytics, font loading) but no app-thrown errors.
    const appErrors = errors.filter(e =>
      !/favicon|woff|tracking|cookie|fontfaceset|cross-origin/i.test(e),
    )
    expect(appErrors).toEqual([])
  })
})
