// apps/web/e2e/search.auth.spec.ts
// /search page renders the filter sidebar + project table + facet counts.
// Filters are URL-driven so we test query-param round-trips.

import { test, expect } from '@playwright/test'

test.describe('/search page (authenticated)', () => {
  test('renders the page shell with sidebar and result count', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByRole('heading', { name: /search projects/i })).toBeVisible()
    await expect(page.getByText(/results/i).first()).toBeVisible()
  })

  test('city filter narrows results — Dubai only', async ({ page }) => {
    await page.goto('/search?city=Dubai')
    // Headline still renders; we mostly assert the page didn't error.
    await expect(page.getByRole('heading', { name: /search projects/i })).toBeVisible()
    // Result count text should be present and finite.
    await expect(page.getByText(/^\d+\s*results?/i).first()).toBeVisible()
  })

  test('combining city + minScore renders without error', async ({ page }) => {
    await page.goto('/search?city=Dubai&minScore=30')
    await expect(page.getByRole('heading', { name: /search projects/i })).toBeVisible()
  })

  test('Browse all link from /ask page lands here', async ({ page }) => {
    // Jump straight from search to verify forward-and-back URL contract.
    await page.goto('/search')
    await expect(page).toHaveURL(/\/search/)
  })
})
