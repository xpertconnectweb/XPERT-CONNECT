import { test, expect } from '@playwright/test'
import { mockGeocode } from '../../helpers/geocode-mock'

/**
 * The three things that make the map and the list agree with each other.
 *
 * Each of these was broken in a way that looked like a design choice rather
 * than a defect, which is why they get a file: hovering a pin said nothing,
 * a shared link restored a selection nobody could see, and there was no way to
 * reach the search box from the keyboard.
 *
 * Anchored via the URL rather than by typing an address. It is deterministic,
 * it needs no geocoder round trip, and it exercises the shared-link path that
 * two of these three tests are about.
 */
const NEAR_BRADENTON =
  '/professionals/map?at=27.491257,-82.481824&near=862%2062nd%20St%20Cir%20E&r=25'

test.describe('the map answers back', () => {
  test.beforeEach(async ({ page }) => {
    await mockGeocode(page)
  })

  /**
   * Hovering a marker is NOT tested here, and that is a decision rather than
   * an omission.
   *
   * The tooltip works: `tests/unit/map-tooltip.test.ts` pins what it says, and
   * `scripts/ux/shoot.ts` photographs it. What cannot be pinned is a marker
   * being individually on screen — whether a pin renders on its own or inside
   * a cluster depends on the viewport, the zoom the fit happened to choose,
   * and how the data is distributed that day. Written as an assertion it
   * passed locally and, under the E2E server, found no unclustered pin at all.
   *
   * `map-and-refer.spec.ts` reached the same conclusion about markers before
   * this file existed. A test that is green because the layout cooperated is
   * worse than no test: it teaches people to re-run rather than to look.
   */

  /**
   * Every selection is serialised into `?sel=`, so this link is in circulation.
   * It used to restore the id into state and stop there: the pin stayed
   * unpainted and the row sat somewhere in an unscrolled virtual list, which
   * from the recipient's side is indistinguishable from nothing having been
   * shared.
   */
  test('lands a shared link on the row it named', async ({ page }) => {
    await page.goto(NEAR_BRADENTON)
    await expect(page.getByTestId('map-panel-row').first()).toBeVisible({ timeout: 20_000 })

    // Take a real id from the rendered list rather than hard-coding one, so
    // this survives the data changing underneath it.
    const first = page.getByTestId('map-panel-row').first()
    const name = (await first.innerText()).split('\n')[0].trim()

    await first.getByTestId('map-panel-row-focus').click()
    await expect(page).toHaveURL(/sel=/, { timeout: 10_000 })
    const shared = page.url()

    await page.goto(shared)
    await expect(page.getByTestId('map-panel-row').first()).toBeVisible({ timeout: 20_000 })

    const current = page.locator('[data-testid="map-panel-row"][aria-current="true"]')
    await expect(current).toHaveCount(1)
    await expect(current).toContainText(name)
  })

  test('puts the cursor in the search box on /', async ({ page }) => {
    await page.goto('/professionals/map')
    const input = page.getByTestId('map-search-input')
    await expect(input).toBeVisible({ timeout: 20_000 })

    await page.locator('[data-testid="map-shell"]').click({ position: { x: 400, y: 500 } })
    await page.keyboard.press('/')
    await expect(input).toBeFocused()
  })

  /**
   * The half of a global shortcut that is easy to forget: a slash typed INTO a
   * field is a slash, not a shortcut. Without this guard nobody could type an
   * address with a fraction or a suite number in it.
   */
  test('leaves a slash typed into the box alone', async ({ page }) => {
    await page.goto('/professionals/map')
    const input = page.getByTestId('map-search-input')
    await expect(input).toBeVisible({ timeout: 20_000 })

    await input.click()
    await input.type('a/b')
    await expect(input).toHaveValue('a/b')
  })
})
