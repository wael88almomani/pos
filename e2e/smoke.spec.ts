import { test, expect } from '@playwright/test'

test.describe('POS shell', () => {
  test('login page heading', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible()
  })
})
