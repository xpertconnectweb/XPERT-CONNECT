import { test, expect } from '@playwright/test'

/**
 * The unified search box.
 *
 * Deliberately asserts on the box and the results panel rather than on Leaflet
 * markers - see the note in map-and-refer.spec.ts about marker flakiness.
 */
test.describe('unified map search', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/professionals/map')
    await expect(page.getByTestId('map-search-input')).toBeVisible({ timeout: 20_000 })
  })

  /**
   * At desktop widths the results panel is docked and its toggle is hidden,
   * because a control that cannot change anything is worse than no control.
   * Below `lg` the panel is still an overlay and has to be opened.
   */
  async function openResults(page: import('@playwright/test').Page) {
    // Keyed on aria-expanded, not on pixel visibility: the panel hides by
    // sliding out, and Playwright still counts a translated element as visible.
    const toggle = page.getByTestId('map-panel-toggle')
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('map-panel-list')).toBeVisible()
  }

  test('replaces the two old inputs with one combobox', async ({ page }) => {
    const box = page.getByTestId('map-search-input')
    await expect(box).toHaveAttribute('role', 'combobox')
    await expect(box).toHaveAttribute('aria-expanded', 'false')

    // The pair of boxes people had to choose between is gone.
    await expect(page.getByPlaceholder('Filter by name, specialty')).toBeHidden()
    await expect(page.getByPlaceholder('Search address, city, or ZIP')).toBeHidden()
  })

  test('suggests providers as you type and filters the panel', async ({ page }) => {
    const box = page.getByTestId('map-search-input')
    await box.fill('chiro')

    await expect(page.getByTestId('map-search-listbox')).toBeVisible()
    await expect(box).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('map-search-option').first()).toBeVisible()

    await openResults(page)
    await expect(page.getByText(/results found/i)).toBeVisible()
  })

  test('arrow keys move the ARIA active option without losing input focus', async ({ page }) => {
    const box = page.getByTestId('map-search-input')
    await box.fill('chiro')
    await expect(page.getByTestId('map-search-option').first()).toBeVisible()

    await box.press('ArrowDown')
    await expect(box).toHaveAttribute('aria-activedescendant', /.+/)
    await expect(box).toBeFocused()
  })

  test('finds clinics by ZIP, which the old filter box could not do', async ({ page }) => {
    await page.getByTestId('map-search-input').fill('32501')
    await openResults(page)
    await expect(page.getByText(/results found/i)).toBeVisible()
  })

  test('clears the query and returns focus to the box', async ({ page }) => {
    const box = page.getByTestId('map-search-input')
    await box.fill('chiro')
    await page.getByTestId('map-search-clear').click()
    await expect(box).toHaveValue('')
    await expect(box).toBeFocused()
  })

  test('picking a result marks it as current in the panel', async ({ page }) => {
    await openResults(page)
    const rows = page.getByTestId('map-panel-row')
    await expect(rows.first()).toBeVisible()

    // A panel click used to only re-centre the map, leaving no sign of which
    // result had been picked.
    await rows.first().click()
    await expect(rows.first()).toHaveAttribute('aria-current', 'true')
  })

  test('stays scrollable after a result is selected', async ({ page }) => {
    // Selecting a row used to pin the list: scrolling dragged the cursor over
    // other rows, each hover asked the list to scroll back to the selection,
    // and the panel became impossible to move.
    await openResults(page)
    const rows = page.getByTestId('map-panel-row')
    await expect(rows.first()).toBeVisible()
    await rows.first().click()
    await expect(rows.first()).toHaveAttribute('aria-current', 'true')

    const list = page.getByTestId('map-panel-list').locator('div').first()
    const before = await list.evaluate((el) => el.scrollTop)

    await list.hover()
    await page.mouse.wheel(0, 600)
    await expect.poll(async () => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(before)

    // And it must stay put rather than springing back to the selected row.
    const after = await list.evaluate((el) => el.scrollTop)
    await page.waitForTimeout(600)
    expect(await list.evaluate((el) => el.scrollTop)).toBe(after)
  })

  test('can be hidden and shown again, and flags results while hidden', async ({ page }) => {
    await openResults(page)
    const toggle = page.getByTestId('map-panel-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await page.getByTestId('map-panel-close').click()
    // The panel slides out rather than unmounting, so assert on the semantics
    // instead of on pixel visibility.
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // The toggle carries the count, so hiding the list does not hide the fact
    // that there are results behind it.
    await expect(toggle).toHaveAccessibleName(/show results list, \d+ results?/i)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('map-panel-row').first()).toBeVisible()
  })

  test('honours a ?near= deep link from the referral form', async ({ page }) => {
    // ReferrerReferralForm generates these; the address deliberately carries a
    // unit designator, which Nominatim returns nothing for unless stripped.
    await page.goto('/professionals/map?near=' + encodeURIComponent('1000 Legion Pl #1000, Orlando, FL 32801'))

    // The address resolves and becomes the anchor chip, with no dropdown left
    // open for the user to deal with.
    await expect(page.getByTestId('map-search-chip')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('map-search-listbox')).toBeHidden()
  })

  test('records the search in the URL and restores it from a shared link', async ({ page }) => {
    await page.getByTestId('map-search-input').fill('chiro')
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('chiro')

    const shared = page.url()
    await page.goto('/professionals/map')
    await expect(page.getByTestId('map-search-input')).toHaveValue('')

    await page.goto(shared)
    await expect(page.getByTestId('map-search-input')).toHaveValue('chiro')
  })

  test('offers to re-scope after the map is panned, and does not do it unasked', async ({ page }) => {
    await openResults(page)
    const count = page.getByText(/results found/i)
    await expect(count).toBeVisible()
    const before = await count.innerText()

    const pill = page.getByTestId('map-search-this-area')
    await expect(pill).toBeHidden()

    // Drag the map a long way. Stay on the left half: the results panel is
    // open and covers the right.
    const map = page.locator('.leaflet-container')
    const box = await map.boundingBox()
    if (!box) throw new Error('map not measurable')
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.7)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.15, { steps: 15 })
    await page.mouse.up()

    // The results must not have re-sorted on their own — that silent reshuffle
    // is exactly what this phase set out to remove.
    await expect(pill).toBeVisible({ timeout: 10_000 })
    expect(await count.innerText()).toBe(before)

    await pill.click()
    await expect(page.getByTestId('map-clear-viewport')).toBeVisible()
    await expect.poll(async () => count.innerText()).not.toBe(before)
  })
})

test.describe('results sheet on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('presents the results as a draggable sheet, not a drawer', async ({ page }) => {
    await page.goto('/professionals/map')
    await expect(page.getByTestId('map-search-input')).toBeVisible({ timeout: 20_000 })

    const sheet = page.getByTestId('map-results-sheet')
    // Peeks by default rather than covering the map or hiding entirely.
    await expect(sheet).toBeVisible()

    const handle = page.getByRole('button', { name: /resize results panel/i })
    await expect(handle).toHaveAccessibleName(/currently peek/i)

    // Reachable without dragging, which a touch-only affordance would not be.
    await handle.press('ArrowUp')
    await expect(handle).toHaveAccessibleName(/currently half/i)
    await expect(page.getByTestId('map-panel-list')).toBeVisible()

    await handle.press('ArrowUp')
    await expect(handle).toHaveAccessibleName(/currently full/i)
  })
})
