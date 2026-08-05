import { test, expect } from '@playwright/test'

test.describe('legal directory', () => {
  test('lands on the attorney directory and filters by practice area', async ({
    page,
  }) => {
    // The role router in /professionals redirects directory accounts here.
    await page.goto('/professionals')
    await expect(page).toHaveURL(/\/professionals\/attorneys$/)

    const count = page.getByTestId('directory-result-count')
    await expect(count).toBeVisible({ timeout: 15_000 })
    const total = Number(await count.innerText())
    expect(total).toBeGreaterThan(0)

    // Practice-area cards are the "types of lawyer" view the client asked for.
    const cards = page.getByTestId('practice-area-card')
    expect(await cards.count()).toBeGreaterThan(1)

    const criminal = cards.filter({ hasText: 'Criminal Defense' }).first()
    await criminal.click()

    await expect(criminal).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(async () => Number(await count.innerText()))
      .toBeLessThan(total)

    // A directory entry has to be callable — this is the whole point of
    // /api/directory/lawyers returning phone and address.
    await expect(
      page.getByTestId('attorney-row').first().locator('a[href^="tel:"]')
    ).toBeVisible()

    // Clicking the selected card again clears the filter.
    await criminal.click()
    await expect(criminal).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => Number(await count.innerText())).toBe(total)
  })

  test('cannot reach other portals', async ({ page }) => {
    await page.goto('/professionals/map')
    await expect(page).toHaveURL(/\/professionals\/attorneys/)

    await page.goto('/admin/dashboard')
    await expect(page).not.toHaveURL(/\/admin\/dashboard/)
  })
})
