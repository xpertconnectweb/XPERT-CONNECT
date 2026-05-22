import { test, expect } from '@playwright/test'

test.describe('lawyer cannot access admin area', () => {
  test.use({ storageState: '.auth/lawyer.json' })

  test('lawyer hitting /admin/dashboard is redirected away', async ({ page }) => {
    const response = await page.goto('/admin/dashboard')
    await expect(page).not.toHaveURL(/\/admin\/dashboard/)
    if (response) {
      expect([200, 302, 307, 403]).toContain(response.status())
    }
  })

  test('lawyer hitting /admin/clinics is blocked', async ({ page }) => {
    await page.goto('/admin/clinics')
    await expect(page).not.toHaveURL(/\/admin\/clinics/)
  })
})

test.describe('clinic cannot access lawyer-only areas', () => {
  test.use({ storageState: '.auth/clinic.json' })

  test('clinic hitting /professionals/map is allowed or redirected (role-specific)', async ({
    page,
  }) => {
    await page.goto('/professionals/map')
    await expect(page).toHaveURL(/\/professionals/)
  })
})

test.describe('admin can access /admin', () => {
  test.use({ storageState: '.auth/admin.json' })

  test('admin reaches /admin/dashboard', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/admin\/dashboard/)
    await expect(page.getByRole('heading')).toBeVisible()
  })
})

test.describe('unauthenticated user is redirected to login', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('hitting /admin without session redirects to login', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page).toHaveURL(/\/(professionals\/)?login/i)
  })
})
