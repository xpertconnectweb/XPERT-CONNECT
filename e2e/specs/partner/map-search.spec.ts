import { test, expect } from '@playwright/test'

/**
 * The partner map had no coverage at all until the throwaway partner account
 * landed in `global.setup.ts` — the project could not even authenticate.
 *
 * Deliberately narrow: the search pipeline itself is exercised in depth by
 * `lawyer/map-search.spec.ts`. What is worth asserting HERE is that the partner
 * feed reaches that pipeline, because it is the one surface fed by a fixed id
 * list (`PARTNER_CLINIC_IDS`) through `/api/partners/clinics` rather than by a
 * state query — a different route, a different shape, and the one most likely
 * to silently return nothing.
 */
test.describe('partner map search', () => {
  test.skip(
    !process.env.E2E_PARTNER_USER || !process.env.E2E_PARTNER_PASS,
    'Partner credentials not configured and none could be provisioned',
  )

  test.beforeEach(async ({ page }) => {
    await page.goto('/partners/map')
    await expect(page.getByTestId('map-search-input')).toBeVisible({ timeout: 30_000 })
  })

  async function openResults(page: import('@playwright/test').Page) {
    const toggle = page.getByTestId('map-panel-toggle')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  }

  test('shows the partner clinic list and narrows it on a query', async ({ page }) => {
    await openResults(page)

    const rows = page.getByTestId('map-panel-row')
    await expect(rows.first()).toBeVisible()
    const before = await rows.count()
    // The partner feed is a short curated list, not the whole directory.
    expect(before).toBeGreaterThan(0)

    // Every partner clinic is chiropractic, so this must not narrow anything —
    // it proves the specialty field is indexed rather than that filtering works.
    await page.getByTestId('map-search-input').fill('chiropractic')
    await expect(page.getByText(/results? found/i)).toBeVisible()
    await expect.poll(async () => rows.count()).toBe(before)
  })

  test('finds a partner clinic by name and reports nothing for a miss', async ({ page }) => {
    await openResults(page)
    const box = page.getByTestId('map-search-input')
    const rows = page.getByTestId('map-panel-row')

    const firstName = (await rows.first().innerText()).split('\n')[0].trim()
    expect(firstName.length).toBeGreaterThan(2)

    await box.fill(firstName)
    await expect.poll(async () => rows.count()).toBeGreaterThan(0)

    // A query that matches nothing has to say so rather than fall back to
    // showing the full list, which is how an empty feed hides itself.
    await box.fill('zzzzq-no-such-clinic')
    await expect.poll(async () => rows.count()).toBe(0)
  })

  test('suggests entities as the partner types', async ({ page }) => {
    await page.getByTestId('map-search-input').fill('spinal')
    await expect(page.getByTestId('map-search-listbox')).toBeVisible()
    await expect(page.getByTestId('map-search-option').first()).toBeVisible()
  })
})
