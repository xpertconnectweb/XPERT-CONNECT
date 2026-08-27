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

  /**
   * The row shows two specialties and a "+N" that used to be a dead label.
   * 39% of clinics have more than two, so for those the rest were simply
   * unreachable — the row is 96 fixed pixels and there was nowhere else to
   * look.
   */
  test('opens one record in full, and gets back to the list', async ({ page }) => {
    await page.goto(NEAR_BRADENTON)
    const first = page.getByTestId('map-panel-row').first()
    await expect(first).toBeVisible({ timeout: 20_000 })
    // `map-panel-row`'s first text node is the provider name, and the suite
    // relies on that elsewhere too.
    const name = (await first.innerText()).split('\n')[0].trim()

    await first.getByTestId('map-panel-row-details').click()

    const detail = page.getByTestId('map-detail')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText(name)
    // Every tag, not the two the row had room for.
    await expect(page.getByTestId('map-detail-tags')).toBeVisible()
    // Refer survives into the detail, under the name the suite already knows.
    await expect(
      page.getByRole('button', { name: new RegExp('^Refer a patient to') })
    ).toBeVisible()

    await page.getByTestId('map-detail-back').click()
    await expect(detail).toBeHidden()
    await expect(page.getByTestId('map-panel-row').first()).toBeVisible()
  })

  /**
   * Contact details are withheld from this map on purpose — `public-shape.ts`
   * strips `phone` so a provider cannot be reached around the referral flow.
   * The Call action is therefore conditional, and its absence here is the
   * privacy rule working rather than a missing feature.
   */
  test('does not offer a way around the referral flow', async ({ page }) => {
    await page.goto(NEAR_BRADENTON)
    await expect(page.getByTestId('map-panel-row').first()).toBeVisible({ timeout: 20_000 })
    await page.getByTestId('map-panel-row-details').first().click()

    await expect(page.getByTestId('map-detail')).toBeVisible()
    await expect(page.getByTestId('map-detail-call')).toHaveCount(0)
  })

  /**
   * The results list is virtualised: about twenty of four hundred rows are in
   * the DOM at a time, and every row carries a real `<button>`. Tab therefore
   * reached row twenty and left the list, because the browser will not scroll
   * a virtual list to look for the next focusable. Four hundred results,
   * twenty reachable.
   */
  test('lets the keyboard reach past the rendered window', async ({ page }) => {
    await page.goto(NEAR_BRADENTON)
    await expect(page.getByTestId('map-panel-row').first()).toBeVisible({ timeout: 20_000 })

    await page.getByTestId('map-panel-row-focus').first().focus()
    await page.keyboard.press('End')
    // The row has to be scrolled into existence before it can be focused, so
    // the focus lands a frame later. Waiting for the frame is the behaviour,
    // not a workaround for flake.
    await page.waitForTimeout(500)

    // The last row exists, is focused, and is one the initial window never
    // contained.
    const total = await page.getByTestId('map-panel-row').count()
    const focused = await page.evaluate(
      () => document.activeElement?.closest('[aria-posinset]')?.getAttribute('aria-posinset')
    )
    expect(Number(focused)).toBeGreaterThan(total)
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
