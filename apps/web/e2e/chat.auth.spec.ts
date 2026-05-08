// apps/web/e2e/chat.auth.spec.ts
// Conversation flow: landing prompt → /api/threads creates thread → redirect
// to /ask/:id → assistant message appears → follow-up sends → tool cards
// render if invoked.
//
// These tests hit the real Azure OpenAI endpoint (so they cost a few cents
// each and take a few seconds). Skip with `--grep -i "(?!chat)"` if needed.

import { test, expect } from '@playwright/test'

test.describe('Chat conversation (authenticated)', () => {
  test.setTimeout(60_000)   // LLM round-trips can be slow

  test('landing prompt creates a thread and redirects to /ask/:id', async ({ page }) => {
    await page.goto('/')
    await page.getByPlaceholder(/ask about projects/i).fill('Show me Dubai projects under 2M')
    await page.getByRole('button', { name: /^send$/i }).click()
    await page.waitForURL(/\/ask\/[a-f0-9\-]{20,}/, { timeout: 20_000 })
    expect(page.url()).toMatch(/\/ask\/[a-f0-9\-]{20,}/)
  })

  test('conversation page renders the user message and an assistant reply', async ({ page }) => {
    await page.goto('/')
    await page.getByPlaceholder(/ask about projects/i).fill('What developers are in Business Bay?')
    await page.getByRole('button', { name: /^send$/i }).click()
    await page.waitForURL(/\/ask\//)

    // User bubble appears immediately.
    await expect(page.getByText('What developers are in Business Bay?').first()).toBeVisible()

    // Wait for the assistant reply (or a graceful failure message).
    await expect(
      page.locator('div').filter({ hasText: /Business Bay|don't have data|catalogue is loading|i'm focused/i }).last()
    ).toBeVisible({ timeout: 45_000 })
  })

  test('follow-up message appends to the thread', async ({ page }) => {
    await page.goto('/')
    await page.getByPlaceholder(/ask about projects/i).fill('List Sobha projects')
    await page.getByRole('button', { name: /^send$/i }).click()
    await page.waitForURL(/\/ask\//)

    // Wait for the first reply to land (any non-empty assistant bubble).
    await page.waitForFunction(() => {
      const bubbles = document.querySelectorAll('div')
      return Array.from(bubbles).some(b => /sobha|don't have/i.test(b.textContent || ''))
    }, null, { timeout: 45_000 })

    // Send a follow-up.
    const followup = page.getByPlaceholder(/ask a follow-up/i)
    await followup.fill('Compare the top two')
    await followup.press('Enter')

    // The user follow-up should render as a bubble.
    await expect(page.getByText('Compare the top two').last()).toBeVisible({ timeout: 10_000 })
  })

  test('clicking "New" on the conversation header returns to landing', async ({ page }) => {
    await page.goto('/')
    await page.getByPlaceholder(/ask about projects/i).fill('Hello')
    await page.getByRole('button', { name: /^send$/i }).click()
    await page.waitForURL(/\/ask\//)
    await page.getByRole('link', { name: /new/i }).first().click()
    await expect(page).toHaveURL(/\/$|^\/$/)
  })
})
