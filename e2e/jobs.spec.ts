import { test, expect } from '@playwright/test'
import { login } from './auth.setup'

test.describe('Job creation flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('navigates to Report Fault page', async ({ page }) => {
    await page.goto('/jobs/new')

    // Page header should show "Report Fault"
    await expect(page.getByText('Report Fault')).toBeVisible({ timeout: 10_000 })

    // Step 1 store selector should be visible
    await expect(page.getByText(/Step 1/i)).toBeVisible()
  })

  test('shows job form after selecting a store', async ({ page }) => {
    await page.goto('/jobs/new')
    await expect(page.getByText('Report Fault')).toBeVisible({ timeout: 10_000 })

    // Wait for stores to load in the dropdown
    const storeSelect = page.locator('[role="combobox"]').first()
    await expect(storeSelect).toBeVisible({ timeout: 10_000 })

    // Open the store dropdown and select the first option
    await storeSelect.click()
    const firstOption = page.locator('[role="option"]').first()
    await expect(firstOption).toBeVisible({ timeout: 5_000 })
    await firstOption.click()

    // Step 2 should now be visible with the job form
    await expect(page.getByText(/Step 2/i)).toBeVisible({ timeout: 5_000 })

    // Job form fields should appear
    await expect(page.locator('#title')).toBeVisible()
  })

  test('validates required fields on job form', async ({ page }) => {
    await page.goto('/jobs/new')
    await expect(page.getByText('Report Fault')).toBeVisible({ timeout: 10_000 })

    // Select a store first
    const storeSelect = page.locator('[role="combobox"]').first()
    await expect(storeSelect).toBeVisible({ timeout: 10_000 })
    await storeSelect.click()
    const firstOption = page.locator('[role="option"]').first()
    await expect(firstOption).toBeVisible({ timeout: 5_000 })
    await firstOption.click()

    // Wait for form to appear
    await expect(page.locator('#title')).toBeVisible({ timeout: 5_000 })

    // Try to submit without filling required fields
    const submitButton = page.getByRole('button', { name: /Create Job/i })
    await expect(submitButton).toBeVisible()
    await submitButton.click()

    // HTML5 validation should prevent submission (title is required)
    // The form should still be on the page
    await expect(page).toHaveURL(/\/jobs\/new/)
  })

  test('job log page shows job list', async ({ page }) => {
    await page.goto('/jobs')

    // Wait for the page to load
    await page.waitForTimeout(3_000)

    // The page should show a job list or empty state
    await expect(page.getByText(/Job/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
