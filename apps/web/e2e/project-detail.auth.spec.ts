// apps/web/e2e/project-detail.auth.spec.ts
// Walks: /search → click first project → /projects/[slug] should render.
// Uses the live DB so assertions are intentionally loose (slug, name presence).

import { test, expect } from '@playwright/test'

test.describe('Project detail (authenticated)', () => {
  test('opens the first project from /search and renders its detail page', async ({ page }) => {
    await page.goto('/search')

    // Find the first project link inside the table. Project rows link to
    // /projects/<slug>.
    const firstProjectLink = page.locator('a[href^="/projects/"]').first()
    if ((await firstProjectLink.count()) === 0) {
      test.skip(true, 'No projects in DB yet — skipping detail test.')
    }
    const href = await firstProjectLink.getAttribute('href')
    expect(href).toMatch(/^\/projects\/[a-z0-9\-]+/)
    await firstProjectLink.click()

    await expect(page).toHaveURL(/\/projects\/[a-z0-9\-]+/)

    // The page should show some heading (the project name) and a back link.
    await expect(page.locator('h1').first()).toBeVisible()
  })
})
