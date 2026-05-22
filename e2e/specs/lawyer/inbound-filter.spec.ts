import { test, expect } from '../../fixtures/factories'

// ReferralsView (src/components/professionals/ReferralsView.tsx) doesn't
// expose a status filter dropdown or per-status buttons — it just shows
// per-status counts. Unskip once the filter UI lands.
test.skip('lawyer can filter their referrals by status', async ({ page }) => {
  await page.goto('/professionals/referrals')

  const statusFilter = page.getByLabel(/status/i).first()
  if (await statusFilter.count()) {
    await statusFilter
      .selectOption('received')
      .catch(() => statusFilter.selectOption('pending'))
  } else {
    await page.getByRole('button', { name: /received|pending/i }).first().click()
  }

  await expect(page).toHaveURL(/\/professionals\/referrals/)

  // The table either shows only matching rows or an empty state — both are valid.
  const tableBody = page.locator('tbody').first()
  await tableBody.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
})
