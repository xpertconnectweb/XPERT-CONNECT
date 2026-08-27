import { test, expect, type Page } from '@playwright/test'
import { mockGeocode } from '../../helpers/geocode-mock'

/**
 * Deciding how far out to look, and — on a phone — being able to see the box
 * you are typing into.
 *
 * Both of these are states that only exist after an interaction, which is the
 * category of thing this codebase has repeatedly shipped broken: the "+N" that
 * revealed nothing, the suggestion that jumped nowhere, the shared link that
 * selected a row invisibly. Every one of them looked fine at rest.
 */

/**
 * Drag the map far enough to count as having gone somewhere.
 *
 * The threshold is a proportion of the visible width — 30% — rather than a
 * fixed distance, because a viewport spans half a mile at street zoom and
 * three hundred at state zoom. Half the shell clears it at any zoom, which is
 * what makes this stable rather than lucky.
 */
async function panAway(page: Page) {
  const shell = await page.getByTestId('map-shell').boundingBox()
  if (!shell) throw new Error('no map shell')
  const y = shell.y + shell.height / 2
  const from = shell.x + shell.width * 0.75
  await page.mouse.move(from, y)
  await page.mouse.down()
  await page.mouse.move(shell.x + shell.width * 0.2, y, { steps: 14 })
  await page.mouse.up()
}

test.describe('how far out to look', () => {
  test.beforeEach(async ({ page }) => {
    await mockGeocode(page)
    await page.goto('/professionals/map')
    await expect(page.getByTestId('map-results-summary')).toBeVisible({ timeout: 30_000 })
  })

  /**
   * Off by default, and absent until the question arises. A permanent checkbox
   * on a map nobody has touched yet is a setting looking for a problem.
   */
  test('offers to follow the map only once the map has been moved', async ({ page }) => {
    await expect(page.getByTestId('map-auto-area')).toHaveCount(0)

    await panAway(page)
    await expect(page.getByTestId('map-auto-area')).toBeVisible()
    await expect(page.getByTestId('map-auto-area')).not.toBeChecked()
    // The manual pill is still the default answer.
    await expect(page.getByTestId('map-search-this-area')).toBeVisible()
  })

  /**
   * A switch that takes effect only on your NEXT pan looks broken, so turning
   * it on re-scopes immediately.
   */
  test('re-scopes the moment it is switched on, then keeps up on its own', async ({ page }) => {
    await panAway(page)
    const everywhere = await page.getByTestId('map-results-summary').innerText()

    await page.getByTestId('map-auto-area').check()
    await expect
      .poll(async () => page.getByTestId('map-results-summary').innerText(), { timeout: 15_000 })
      .not.toBe(everywhere)

    // Nothing left to ask: neither the pill that offers to re-scope nor the one
    // that offers to stop, because the switch is now the single control for
    // both and two ways to release the same viewport would fight.
    await expect(page.getByTestId('map-search-this-area')).toHaveCount(0)
    await expect(page.getByTestId('map-clear-viewport')).toHaveCount(0)

    const scoped = await page.getByTestId('map-results-summary').innerText()
    await panAway(page)
    await expect
      .poll(async () => page.getByTestId('map-results-summary').innerText(), { timeout: 15_000 })
      .not.toBe(scoped)
    await expect(page.getByTestId('map-search-this-area')).toHaveCount(0)
  })

  /**
   * The regression this feature shipped with, caught by driving it rather than
   * by reading it: the switch was rendered only while it was ON or the map had
   * just moved, so turning it off unmounted the control under the cursor with
   * no way back short of panning again.
   */
  test('survives being switched off', async ({ page }) => {
    await panAway(page)
    await page.getByTestId('map-auto-area').check()
    await expect(page.getByTestId('map-clear-viewport')).toHaveCount(0)

    await page.getByTestId('map-auto-area').uncheck()
    await expect(page.getByTestId('map-auto-area')).toBeVisible()
    await expect(page.getByTestId('map-auto-area')).not.toBeChecked()
    // Switching off releases the viewport too, so nobody has to find a second
    // control to undo what this one did.
    await expect(page).not.toHaveURL(/bbox=/)
  })
})

/**
 * The phone search screen.
 *
 * `test.use` rather than a new Playwright project: a phone-width project would
 * run the entire lawyer suite at 390px, most of which is written against the
 * docked rail and would fail for reasons that have nothing to do with this.
 */
test.describe('searching on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await mockGeocode(page)
    await page.goto('/professionals/map')
    await expect(page.getByTestId('map-search-input')).toBeVisible({ timeout: 30_000 })
    // `useMediaQuery` starts false and corrects itself in an effect, so for the
    // first frames the page is laid out as if it were wide. Measuring across
    // that boundary compares a phone against a desktop and reports nothing
    // useful. The Filters button exists only on a phone, so waiting for it is
    // a real signal that the breakpoint has settled rather than a sleep.
    await expect(page.getByTestId('map-filters-toggle')).toBeVisible()
  })

  test('gives the box the whole screen, and a way back out', async ({ page }) => {
    const input = page.getByTestId('map-search-input')
    const before = await input.boundingBox()

    await input.click()

    // The SAME node, grown. A second search box would satisfy a screenshot and
    // break the ARIA combobox contract, `/`, and every test that addresses this
    // id — so the count is the assertion that matters most here.
    await expect(input).toHaveCount(1)
    await expect(page.getByTestId('map-search-cancel')).toBeVisible()

    // Polled, not read once. The Cancel button and the container's new classes
    // land in the same React commit, but the measurement can still be taken
    // against the old layout box — under the full suite's load this read 260
    // for both states while the screenshot showed a correctly expanded search
    // screen. Passing in isolation and failing in the suite is the signature of
    // reading a value that is still settling.
    await expect
      .poll(async () => (await input.boundingBox())?.width ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(before!.width)

    // A full-screen overlay covers whatever you would otherwise tap to dismiss
    // it, so it has to carry its own exit.
    await page.getByTestId('map-search-cancel').click()
    await expect(page.getByTestId('map-search-cancel')).toHaveCount(0)
    await expect(page.getByTestId('map-filters-toggle')).toBeVisible()
  })

  test('shows suggestions in the room it just took', async ({ page }) => {
    const input = page.getByTestId('map-search-input')
    await input.click()
    await input.type('miami')

    const listbox = page.getByTestId('map-search-listbox')
    await expect(listbox).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('map-search-option').first()).toBeVisible()

    // Taller than the 22rem dropdown it replaces — that cap is right for
    // something floating over a map and wrong for a screen.
    const box = await listbox.boundingBox()
    expect(box!.height).toBeGreaterThan(352)
  })
})
