// apps/web/e2e/analytics.auth.spec.ts
// /analytics is the data-density page. We don't pin specific numbers (real
// data fluctuates) but we verify the metric tiles and chart containers all
// render and that the numeric tiles aren't broken (i.e. don't render NaN).

import { test, expect } from '@playwright/test'

test.describe('/analytics (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics')
  })

  test('headline metric tiles all visible', async ({ page }) => {
    for (const label of [
      /total projects/i,
      /total units/i,
      /units sold/i,
      /avg score/i,
      /avg psf/i,
      /est\.?\s*market value/i,
    ]) {
      await expect(page.getByText(label).first()).toBeVisible()
    }
  })

  test('no metric tile renders NaN, undefined, or null', async ({ page }) => {
    const html = (await page.content()).toLowerCase()
    expect(html).not.toContain('nan')
    expect(html).not.toContain('undefined')
    // Tolerate the literal word "null" only if it appears inside script source.
    // We ensure no rendered tile shows it as a value.
    const visibleNulls = await page.locator('text=/^null$/i').count()
    expect(visibleNulls).toBe(0)
  })

  test('developer rankings panel renders', async ({ page }) => {
    await expect(page.getByText(/developer rankings/i)).toBeVisible()
  })
})
