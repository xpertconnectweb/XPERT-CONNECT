import { test, expect } from '@playwright/test'
import { mockGeocode, UNRESOLVABLE } from '../../helpers/geocode-mock'

/**
 * What happens when the geocoder has never heard of the address.
 *
 * This is the case the client reported: "862 62nd St Cir E, Bradenton, FL"
 * returns nothing from OpenStreetMap — verified by hand against the live
 * service for the raw query, the USPS-expanded query, the street alone and the
 * query with the ZIP appended, because the street is not in the dataset.
 *
 * The old behaviour was silence. `SmartSearchBox` dropped any group that was
 * not loading, not errored and empty, so the "Places" group simply vanished:
 * the map did not move, no message appeared, and the user had no way to tell
 * whether the search was broken, slow, or being honest. People retyped
 * addresses that were already correct.
 *
 * Switching provider makes this rarer. It never makes it impossible, so the
 * empty state has to be usable rather than merely present.
 */
test.describe('an address the provider cannot find', () => {
  test.beforeEach(async ({ page }) => {
    // The default fixture set has no match for the Bradenton address, which is
    // exactly the live behaviour being reproduced.
    await mockGeocode(page)
    await page.goto('/professionals/map')
    await expect(page.getByTestId('map-search-input')).toBeVisible({ timeout: 20_000 })
  })

  test('says so, and names the address that failed', async ({ page }) => {
    await page.getByTestId('map-search-input').fill(UNRESOLVABLE)

    const empty = page.getByTestId('map-search-group-empty')
    await expect(empty).toBeVisible()
    // Naming it back matters: half the time the user can see at a glance that
    // it is not the address they meant.
    await expect(empty).toContainText('62nd St Cir E')
    await expect(empty).toContainText('ZIP')
  })

  test('offers a way forward instead of a dead end', async ({ page }) => {
    await page.getByTestId('map-search-input').fill(UNRESOLVABLE)

    const options = page.getByTestId('map-search-option')
    await expect(options).toHaveCount(1)
    await expect(options.first()).toContainText('Place the pin yourself')
  })

  test('the manual pin is reachable by keyboard, like every other row', async ({ page }) => {
    // It is a real option, not a line of text dressed up as one. The status
    // rows around it are role="presentation" and the arrow keys skip those.
    const box = page.getByTestId('map-search-input')
    await box.fill(UNRESOLVABLE)
    await expect(page.getByTestId('map-search-option')).toHaveCount(1)

    await box.press('ArrowDown')
    await expect(box).toHaveAttribute('aria-activedescendant', /.+/)
    await box.press('Enter')

    await expect(page.getByTestId('map-pin-placing')).toBeVisible()
  })

  test('a click on the map then sets the location', async ({ page }) => {
    await page.getByTestId('map-search-input').fill(UNRESOLVABLE)
    await page.getByTestId('map-search-option').first().click()
    await expect(page.getByTestId('map-pin-placing')).toBeVisible()

    // Click the middle of the map shell.
    const shell = page.getByTestId('map-shell')
    await shell.click({ position: { x: 200, y: 200 } })

    await expect(page.getByTestId('map-pin-placing')).toBeHidden()
    await expect(page.getByTestId('map-search-chip')).toBeVisible()
  })

  test('the prompt can be dismissed without setting anything', async ({ page }) => {
    await page.getByTestId('map-search-input').fill(UNRESOLVABLE)
    await page.getByTestId('map-search-option').first().click()
    await page.getByTestId('map-pin-placing-cancel').click()

    await expect(page.getByTestId('map-pin-placing')).toBeHidden()
    await expect(page.getByTestId('map-search-chip')).toBeHidden()
  })

  test('two characters says "keep typing" rather than "no match"', async ({ page }) => {
    // The geocoder needs three characters; local sources answer at two. That
    // one-character gap used to render as nothing at all.
    await page.getByTestId('map-search-input').fill('ch')
    await expect(page.getByTestId('map-search-group-idle')).toBeVisible()
    await expect(page.getByTestId('map-search-group-empty')).toBeHidden()
  })
})
