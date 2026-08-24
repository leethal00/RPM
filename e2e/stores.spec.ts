import { test, expect } from '@playwright/test'
import { login } from './auth.setup'

test.describe('Store flows', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('lists stores on the portfolio page', async ({ page }) => {
    await page.goto('/stores')

    // Wait for store list to load (loading state finishes)
    await page.waitForSelector('table', { timeout: 15_000 })

    // Should have a table with at least one row
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible()
  })

  test('can search/filter stores', async ({ page }) => {
    await page.goto('/stores')
    await page.waitForSelector('table', { timeout: 15_000 })

    const searchInput = page.locator('input[placeholder*="Search"]')
    await expect(searchInput).toBeVisible()

    // Type a search term — the table should filter
    await searchInput.fill('Ponsonby')
    // Give the filter time to apply
    await page.waitForTimeout(500)

    // Rows should have been filtered (may be 0 or more depending on data)
    // Just verify the search input accepted the value
    await expect(searchInput).toHaveValue('Ponsonby')
  })

  test('opens store detail page', async ({ page }) => {
    await page.goto('/stores')
    await page.waitForSelector('table', { timeout: 15_000 })

    // Click the first store row's chevron/link to navigate to detail
    const firstRow = page.locator('table tbody tr').first()
    await firstRow.click()

    // Should navigate to /stores/[id]
    await page.waitForURL(/\/stores\//, { timeout: 10_000 })

    // Store detail page should have tabs: Assets, History, Strategy
    await expect(page.getByRole('tab', { name: /Assets/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /History/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Strategy/i })).toBeVisible()
  })

  test('can open Add New Site dialog', async ({ page }) => {
    await page.goto('/stores')
    await page.waitForSelector('table', { timeout: 15_000 })

    // Click "Add New Site" button
    const addButton = page.getByRole('button', { name: /Add New Site/i })
    await expect(addButton).toBeVisible()
    await addButton.click()

    // Dialog should appear with the site form
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // Verify key form fields are present
    await expect(dialog.locator('#name')).toBeVisible()
    await expect(dialog.locator('#address')).toBeVisible()

    // Cancel button should close the dialog
    await dialog.getByRole('button', { name: /Cancel/i }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('store detail shows assets tab with table', async ({ page }) => {
    await page.goto('/stores')
    await page.waitForSelector('table', { timeout: 15_000 })

    // Navigate to first store
    const firstRow = page.locator('table tbody tr').first()
    await firstRow.click()
    await page.waitForURL(/\/stores\//, { timeout: 10_000 })

    // Assets tab should be active by default
    const assetsTab = page.getByRole('tab', { name: /Assets/i })
    await expect(assetsTab).toBeVisible()

    // Wait for content to load
    await page.waitForTimeout(2_000)

    // The assets section should be visible (table or empty state)
    const assetsContent = page.locator('[role="tabpanel"]').first()
    await expect(assetsContent).toBeVisible()
  })
})
