import { Page } from '@playwright/test'

/**
 * Log in via the UI login form and wait for redirect to the home page.
 * Uses E2E_USER_EMAIL / E2E_USER_PASSWORD env vars, falling back to defaults.
 */
export async function login(page: Page) {
  const email = process.env.E2E_USER_EMAIL ?? 'admin@rodier.co.nz'
  const password = process.env.E2E_USER_PASSWORD ?? 'password123'

  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()

  // Wait for redirect away from /login after successful auth
  await page.waitForURL((url) => !url.pathname.includes('/login'), {
    timeout: 15_000,
  })
}
