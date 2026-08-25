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

  /**
   * The directory had a plain input with none of the map's typo tolerance or
   * suggestions. It now shares `SmartSearchBox` — but with `places={false}`,
   * because a geocoded address on a screen with no map resolves to somewhere
   * the user cannot be taken.
   */
  test('shares the smart search box, without offering places', async ({ page }) => {
    await page.goto('/professionals/attorneys')
    const box = page.getByTestId('directory-search-input')
    await expect(box).toBeVisible({ timeout: 15_000 })
    await expect(box).toHaveAttribute('role', 'combobox')

    await box.fill('orlando')
    await expect(page.getByTestId('directory-search-listbox')).toBeVisible()
    // Firms and practice areas, never an address.
    await expect(page.getByText('Places')).toBeHidden()
  })

  test('orders the firms alphabetically on request', async ({ page }) => {
    await page.goto('/professionals/attorneys')
    const rows = page.getByTestId('attorney-row')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })

    const firstNames = async () =>
      (await rows.allInnerTexts()).map((t) => t.split('\n')[0].trim().toLowerCase())

    const before = await firstNames()
    await page.getByTestId('directory-sort').getByRole('radio', { name: 'Alphabetical' }).click()

    // Deliberately NOT re-sorting the names here and comparing. The engine
    // orders by the FOLDED name — "&" becomes " and ", apostrophes vanish,
    // punctuation collapses to spaces — so any comparison built on the visible
    // text disagrees with it on a handful of firms. Reimplementing `fold` in a
    // spec would just be a second copy to keep in sync.
    //
    // What is safe to assert: the order changed, and the leading letters do not
    // go backwards.
    await expect.poll(async () => JSON.stringify(await firstNames())).not.toBe(JSON.stringify(before))

    const letters = (await firstNames())
      .map((n) => n.replace(/[^a-z0-9]/g, '').charAt(0))
      .filter(Boolean)
    expect(letters.length).toBeGreaterThan(1)
    expect([...letters].sort()).toEqual(letters)
  })

  test('offers a way out when nothing matches', async ({ page }) => {
    await page.goto('/professionals/attorneys')
    await expect(page.getByTestId('attorney-row').first()).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('directory-search-input').fill('zzzzqq-no-such-firm')
    await expect(page.getByTestId('directory-empty')).toBeVisible()
    await expect(page.getByTestId('directory-empty-clear')).toBeVisible()
  })

  test('cannot reach other portals', async ({ page }) => {
    await page.goto('/professionals/map')
    await expect(page).toHaveURL(/\/professionals\/attorneys/)

    await page.goto('/admin/dashboard')
    await expect(page).not.toHaveURL(/\/admin\/dashboard/)
  })
})
