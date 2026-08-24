import { test, expect } from '@playwright/test'

const EMAIL = process.env.E2E_USER_EMAIL ?? 'admin@rodier.co.nz'
const PASSWORD = process.env.E2E_USER_PASSWORD ?? 'password123'

test.describe('Login flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('shows the login form', async ({ page }) => {
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toHaveText(/Log In/i)
  })

  test('rejects invalid credentials', async ({ page }) => {
    await page.locator('#email').fill('wrong@example.com')
    await page.locator('#password').fill('badpassword')
    await page.locator('button[type="submit"]').click()

    // Should stay on /login and show an error toast
    await expect(page).toHaveURL(/\/login/)
    // Sonner toast shows error — look for the toast container
    const toast = page.locator('[data-sonner-toast][data-type="error"]')
    await expect(toast).toBeVisible({ timeout: 10_000 })
  })

  test('logs in with valid credentials and redirects to home', async ({ page }) => {
    await page.locator('#email').fill(EMAIL)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('button[type="submit"]').click()

    // Should redirect away from /login
    await page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 15_000,
    })

    // Home page should be loaded (the map/dashboard page at /)
    await expect(page).toHaveURL('/')
  })

  test('redirects unauthenticated users to /login', async ({ page }) => {
    // Try visiting a protected route directly
    await page.goto('/stores')
    await expect(page).toHaveURL(/\/login/)
  })
})
