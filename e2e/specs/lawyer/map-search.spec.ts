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
    await expect(page.getByTestId('map-results-summary')).toBeVisible()
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
    await expect(page.getByTestId('map-results-summary')).toBeVisible()
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
    // result had been picked. The row is a container now — it holds both the
    // focus target and the Refer button — so click the primary target.
    await rows.first().getByTestId('map-panel-row-focus').click()
    await expect(rows.first()).toHaveAttribute('aria-current', 'true')
  })

  test('stays scrollable after a result is selected', async ({ page }) => {
    // Selecting a row used to pin the list: scrolling dragged the cursor over
    // other rows, each hover asked the list to scroll back to the selection,
    // and the panel became impossible to move.
    await openResults(page)
    const rows = page.getByTestId('map-panel-row')
    await expect(rows.first()).toBeVisible()
    await rows.first().getByTestId('map-panel-row-focus').click()
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

    // The anchor is a sibling of the box, not a replacement for it.
    await expect(page.getByTestId('map-search-input')).toBeVisible()
  })

  /**
   * The defect this phase exists to fix.
   *
   * Choosing an address used to swap the whole search box out for a chip, so
   * "clinics near my client, that do chiropractic" was not expressible: you
   * could have the address or the filter, never both. Clearing the address to
   * get the box back also wiped the radius and recentred the map.
   */
  test('keeps free-text filtering available after an address is chosen', async ({ page }) => {
    await page.goto('/professionals/map?near=' + encodeURIComponent('1000 Legion Pl #1000, Orlando, FL 32801'))
    await expect(page.getByTestId('map-search-chip')).toBeVisible({ timeout: 30_000 })

    await openResults(page)
    const rows = page.getByTestId('map-panel-row')
    await expect(rows.first()).toBeVisible()
    const before = await page.getByTestId('map-results-summary').innerText()

    await page.getByTestId('map-search-input').fill('chiro')
    await expect
      .poll(async () => page.getByTestId('map-results-summary').innerText())
      .not.toBe(before)

    // ...and the location survived the filtering.
    await expect(page.getByTestId('map-search-chip')).toBeVisible()
  })

  /**
   * The radius counter used to be the last child of the same wrapping row as
   * the five radius chips. Inside a 420px card it had nowhere to go, so it
   * wrapped to a second line and pushed every control below it down — picking
   * a radius made the card jump under the cursor. It now lives on the summary
   * line, which owns it and cannot reflow the controls above.
   */
  test('does not move the controls when the radius changes', async ({ page }) => {
    await page.goto('/professionals/map?near=' + encodeURIComponent('1000 Legion Pl, Orlando, FL 32801'))
    await expect(page.getByTestId('map-search-chip')).toBeVisible({ timeout: 30_000 })

    const input = page.getByTestId('map-search-input')
    const baseline = (await input.boundingBox())?.y

    for (const name of ['Within 5 miles', 'Within 50 miles', 'Any distance']) {
      await page.getByRole('radio', { name }).click()
      await expect(page.getByTestId('map-summary')).toBeVisible()
      expect((await input.boundingBox())?.y).toBe(baseline)
    }
  })

  /**
   * The regression this phase was always going to cause, written before the
   * code that causes it: framing the map on the new radius ends in a `moveend`,
   * and `moveend` is what raises "Search this area". Without a guard the pill
   * flashes up immediately after the action that framed the map correctly.
   */
  test('does not offer to re-scope after framing the radius itself', async ({ page }) => {
    await page.goto('/professionals/map?near=' + encodeURIComponent('1000 Legion Pl, Orlando, FL 32801'))
    await expect(page.getByTestId('map-search-chip')).toBeVisible({ timeout: 30_000 })

    await page.getByRole('radio', { name: 'Within 25 miles' }).click()
    await page.waitForTimeout(2000)
    await expect(page.getByTestId('map-search-this-area')).toBeHidden()
  })

  test('reframes the map when the radius changes', async ({ page }) => {
    await page.goto('/professionals/map?near=' + encodeURIComponent('1000 Legion Pl, Orlando, FL 32801'))
    await expect(page.getByTestId('map-search-chip')).toBeVisible({ timeout: 30_000 })

    const shell = page.getByTestId('map-shell')
    await page.getByRole('radio', { name: 'Within 5 miles' }).click()
    await expect.poll(async () => shell.getAttribute('data-zoom')).not.toBeNull()
    const close = Number(await shell.getAttribute('data-zoom'))

    // Ten times the radius has to pull the camera back, or the number in the
    // summary is the only evidence anything happened — which is exactly how
    // this screen behaved before.
    await page.getByRole('radio', { name: 'Within 50 miles' }).click()
    await expect.poll(async () => Number(await shell.getAttribute('data-zoom'))).toBeLessThan(close)
  })

  test('offers the radius as one labelled group rather than five loose toggles', async ({ page }) => {
    await page.goto('/professionals/map?near=' + encodeURIComponent('1000 Legion Pl, Orlando, FL 32801'))
    await expect(page.getByTestId('map-search-chip')).toBeVisible({ timeout: 30_000 })

    const group = page.getByRole('radiogroup', { name: 'Search radius' })
    await expect(group).toBeVisible()
    await expect(group.getByRole('radio')).toHaveCount(5)
  })

  test('lets a specialty be picked from the card, with its count', async ({ page }) => {
    await page.goto('/professionals/map?near=' + encodeURIComponent('1000 Legion Pl, Orlando, FL 32801'))
    await expect(page.getByTestId('map-search-chip')).toBeVisible({ timeout: 30_000 })
    await openResults(page)

    const before = await page.getByTestId('map-panel-row').count()
    const chip = page.getByTestId('map-filter-chip').first()
    await expect(chip).toBeVisible()
    await chip.click()

    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => page.getByTestId('map-panel-row').count()).toBeLessThanOrEqual(before)
    // And the whole filter set can be dropped in one go.
    await page.getByTestId('map-clear-filters').click()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
  })

  test('shows the city and ZIP that were typed, not a neighbourhood nobody knows', async ({ page }) => {
    await page.goto('/professionals/map?near=' + encodeURIComponent('3200 SW 34th St Ste 500, Gainesville, FL 32608'))

    const chip = page.getByTestId('map-search-chip')
    await expect(chip).toBeVisible({ timeout: 30_000 })
    // The old label was the first three comma parts of Nominatim's
    // display_name, which for this address reads "3200, Southwest 34th Street,
    // Daysville" — losing the city and ZIP the user actually typed.
    await expect(chip).toContainText('Gainesville')
    await expect(chip).toContainText('32608')
  })

  /**
   * The heading was a hardcoded "Nearest Results" that kept claiming distance
   * order while the engine sorted by relevance — which it did the moment
   * anybody typed. It is now derived from the ordering, so the two cannot
   * drift apart.
   */
  test('names the ordering it is actually using', async ({ page }) => {
    await openResults(page)
    const heading = page.getByTestId('map-panel-heading')
    await expect(heading).toHaveText('Nearest Results')

    await page.getByTestId('map-search-input').fill('chiro')
    await expect(heading).toHaveText('Best Matches')

    await page.getByRole('radio', { name: 'Alphabetical' }).click()
    await expect(heading).toHaveText('All Results, A–Z')
  })

  test('sorts A–Z and carries that choice into a shared link', async ({ page }) => {
    await openResults(page)
    const rows = page.getByTestId('map-panel-row')
    await expect(rows.first()).toBeVisible()

    await page.getByRole('radio', { name: 'Alphabetical' }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('name')

    const names = (await rows.allInnerTexts()).map((t) => t.split('\n')[0].trim().toLowerCase())
    expect([...names].sort()).toEqual(names)

    // Reopening the link keeps the order rather than snapping back to nearest.
    const shared = page.url()
    await page.goto(shared)
    await expect(page.getByTestId('map-panel-heading')).toHaveText('All Results, A–Z')
  })

  test('leaves the URL alone when no order was chosen', async ({ page }) => {
    // Serialising the resolved value would append ?sort=distance to every visit.
    await page.waitForTimeout(1200)
    expect(new URL(page.url()).searchParams.get('sort')).toBeNull()
  })

  test('exposes the results as a counted list, not an arbitrary window', async ({ page }) => {
    await openResults(page)
    const list = page.getByRole('list', { name: /results/i })
    await expect(list).toBeVisible()
    // Virtualisation renders ~15 of N rows; without set semantics a screen
    // reader has no idea which 15 or of how many.
    await expect(page.getByTestId('map-panel-row').first()).toBeVisible()
    const first = list.locator('[aria-posinset]').first()
    await expect(first).toHaveAttribute('aria-posinset', '1')
    await expect(first).toHaveAttribute('aria-setsize', /\d+/)
  })

  /**
   * Referring was only ever possible from the Leaflet popup, which meant
   * finding the right pin among a cluster first. Half of what this screen is
   * for was two clicks and a hunt away.
   */
  test('lets a patient be referred straight from a result row', async ({ page }) => {
    await openResults(page)
    const row = page.getByTestId('map-panel-row').first()
    await expect(row).toBeVisible()

    const refer = row.getByTestId('map-panel-refer')
    await expect(refer).toBeVisible()
    await refer.click()

    // The same modal the pin's popup opens.
    await expect(page.locator('#patientName')).toBeVisible({ timeout: 15_000 })
  })

  test('gives the row action a name that cannot collide with the popup', async ({ page }) => {
    await openResults(page)
    const refer = page.getByTestId('map-panel-refer').first()
    // The popup keeps "Send Referral"; a spec looking for that must not find
    // this instead.
    await expect(refer).toHaveAttribute('aria-label', /^Refer a patient to /)
  })

  /**
   * Reported from the live site: unchecking Clinics did nothing — every pin
   * stayed and the button looked dead. On this map the attorney toggle is
   * already off, so switching Clinics off leaves the type list empty, and the
   * engine was guarding on `length > 0` and reading that as "no filter".
   */
  test('switching the only pin type off actually empties the results', async ({ page }) => {
    await openResults(page)
    const rows = page.getByTestId('map-panel-row')
    await expect(rows.first()).toBeVisible()

    const chip = page.getByRole('button', { name: /^Clinics/ })
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await chip.click()

    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => rows.count()).toBe(0)
    await expect(page.getByTestId('map-panel-empty')).toBeVisible()

    // And it comes back, so the state is not a trap.
    await chip.click()
    await expect.poll(async () => rows.count()).toBeGreaterThan(0)
  })

  test('keeps the type chip count honest while the type is switched off', async ({ page }) => {
    await openResults(page)
    const chip = page.getByRole('button', { name: /^Clinics/ })
    const before = (await chip.innerText()).match(/\d+/)?.[0]

    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    // The chip has to go on saying what turning it back on would give you.
    // It used to report 0, because the count came from the rendered hits.
    expect((await chip.innerText()).match(/\d+/)?.[0]).toBe(before)
  })

  test('offers a way out of an empty result set', async ({ page }) => {
    // Open the panel while it still has rows: openResults waits for the list,
    // and an empty result set renders the empty state instead of one.
    await openResults(page)
    await page.getByTestId('map-search-input').fill('zzzzqq-no-such-provider')

    const empty = page.getByTestId('map-panel-empty')
    await expect(empty).toBeVisible()
    // Not a dead end: the availability filter is on by default, so there is
    // always at least one thing to undo.
    await expect(page.getByTestId('map-empty-clear-filters')).toBeVisible()
  })

  test('proposes a spelling correction the engine has already verified', async ({ page }) => {
    // Three edits from "chiropractic": beyond the matcher's budget, inside the
    // corrector's deliberately wider one. A closer typo like "chiropractc"
    // simply matches, and correcting a query that already worked is noise.
    // didYouMean also only fires under three results, and only when re-running
    // the search with the correction returns more — so it cannot lead to a
    // second dead end.
    await openResults(page)
    await page.getByTestId('map-search-input').fill('chiroprktik')

    const suggestion = page.getByTestId('map-did-you-mean')
    await expect(suggestion).toBeVisible({ timeout: 15_000 })
    await suggestion.click()
    await expect(page.getByTestId('map-panel-row').first()).toBeVisible()
  })

  /**
   * A geocoder resolves to a rooftop centroid, a street segment, or whatever
   * the building was last tagged as — usually close enough for "how far is
   * this clinic from my client", occasionally out by a block. So the pin is
   * the user's to correct, and correcting it has to actually re-anchor the
   * search rather than just move a graphic.
   */
  test('the home pin can be dragged to correct the location', async ({ page }) => {
    // Wider than the default on purpose. With the results panel docked at 400px
    // and the search card occupying the top-left 420px, a 1280px viewport leaves
    // the pin sitting behind the card — so the press lands on glass, not on the
    // pin, and the drag silently never starts.
    await page.setViewportSize({ width: 1600, height: 900 })

    await page.goto('/professionals/map?near=' + encodeURIComponent('1000 Legion Pl, Orlando, FL 32801'))
    await expect(page.getByTestId('map-search-chip')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('radio', { name: 'Within 5 miles' }).click()
    await openResults(page)

    const before = await page.getByTestId('map-results-summary').innerText()
    const pin = page.locator('.xc-home-pin').first()
    await expect(pin).toBeVisible()

    // Choosing a radius frames it with an animated `fitBounds`, which moves the
    // pin for ~300ms afterwards. Measuring during that window presses on empty
    // map, Leaflet pans instead of dragging, and the drop never happens — which
    // is why this passed alone and failed in a full run, where everything is
    // warmer and the measurement lands earlier. So wait for the pin to settle
    // rather than for a duration.
    let box = await pin.boundingBox()
    await expect
      .poll(async () => {
        const next = await pin.boundingBox()
        const settled = !!box && !!next && Math.abs(next.x - box.x) < 1 && Math.abs(next.y - box.y) < 1
        box = next
        return settled
      }, { timeout: 15_000 })
      .toBe(true)

    if (!box) throw new Error('home pin not measurable')
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    // Down and left, away from both the card and the docked panel.
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x - 120, from.y + 180, { steps: 12 })
    await page.mouse.up()

    // The anchor moved, so the distances did.
    await expect(page.getByText(/pin adjusted/i)).toBeVisible({ timeout: 30_000 })
    await expect.poll(async () => page.getByTestId('map-results-summary').innerText()).not.toBe(before)

    // And it is reversible — an accidental drag must not silently re-rank the
    // list for good.
    await page.getByTestId('map-anchor-reset').click()
    await expect(page.getByText(/pin adjusted/i)).toBeHidden()
    await expect(page.getByTestId('map-search-chip')).toContainText('Legion')
  })

  test('the pin says it can be moved, and is reachable by keyboard', async ({ page }) => {
    await page.goto('/professionals/map?near=' + encodeURIComponent('1000 Legion Pl, Orlando, FL 32801'))
    await expect(page.getByTestId('map-search-chip')).toBeVisible({ timeout: 30_000 })

    const pin = page.locator('.xc-home-pin').first()
    // The cursor is the only thing on screen saying the pin can be picked up.
    await expect(pin).toHaveCSS('cursor', 'grab')
    // Dragging is a pointer gesture; without a focusable marker the precision
    // this feature exists for is unavailable to a keyboard entirely.
    await expect(pin).toHaveAttribute('tabindex', '0')
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
    const count = page.getByTestId('map-results-summary')
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

  /**
   * Sort parity is a requirement, not a follow-up: a control that only exists
   * on desktop is a control half the users do not have.
   */
  test('offers the same ordering control inside the sheet', async ({ page }) => {
    await page.goto('/professionals/map')
    await expect(page.getByTestId('map-search-input')).toBeVisible({ timeout: 20_000 })

    const handle = page.getByRole('button', { name: /resize results panel/i })
    await handle.press('ArrowUp')

    const sort = page.getByTestId('map-sort-sheet')
    await expect(sort).toBeVisible()

    const rows = page.getByTestId('map-panel-row')
    await expect(rows.first()).toBeVisible()

    await sort.getByRole('radio', { name: 'Alphabetical' }).click()
    await expect(sort.getByRole('radio', { name: 'Alphabetical' })).toBeChecked()

    // The panel heading lives in the docked panel, which a phone never renders,
    // so assert on the thing the phone can actually show: the order itself.
    await expect
      .poll(async () => {
        const names = (await rows.allInnerTexts()).map((t) => t.split('\n')[0].trim().toLowerCase())
        return names.length > 1 && JSON.stringify([...names].sort((a, b) => a.localeCompare(b))) === JSON.stringify(names)
      })
      .toBe(true)
  })
})
