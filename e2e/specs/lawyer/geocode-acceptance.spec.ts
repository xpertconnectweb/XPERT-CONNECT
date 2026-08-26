import { test, expect } from '@playwright/test'

/**
 * The acceptance test for the client's actual complaint.
 *
 * Tagged `@live` and excluded from every ordinary run (see `grepInvert` in
 * playwright.config.ts). It deliberately does NOT mock `/api/geocode`, because
 * the whole question it answers is about the real provider:
 *
 *   Does "862 62nd St Cir E, Bradenton, Florida" resolve?
 *
 * Today, with Nominatim, it does not — that is a fact about OpenStreetMap's US
 * address coverage, not a bug in this codebase, and it is why this test is
 * currently expected to land in the "not found" branch. The day a provider with
 * real US address data is configured, the same test passes through the other
 * branch and stays there. After that it is the only thing in the suite that
 * would notice an expired API key, a billing lapse, or a provider regression.
 *
 * Run it on a schedule:
 *   E2E_INCLUDE_LIVE=1 npx playwright test --grep @live
 */
const ADDRESS = '862 62nd St Cir E, Bradenton, Florida'

test.describe('live geocoding @live', () => {
  test('resolves the address the client reported, or says why not @live', async ({ page }) => {
    await page.goto('/professionals/map')
    const box = page.getByTestId('map-search-input')
    await expect(box).toBeVisible({ timeout: 20_000 })

    await box.fill(ADDRESS)

    const option = page.getByTestId('map-search-option')
    const empty = page.getByTestId('map-search-group-empty')

    // Generous, and on purpose: this is a real network round trip through a
    // service that paces callers to one request per second.
    await expect(option.or(empty).first()).toBeVisible({ timeout: 30_000 })

    if (await empty.isVisible()) {
      // The provider does not have this street. The requirement in that case is
      // that the product stays usable and honest — never that it goes quiet.
      await expect(empty).toContainText('62nd St Cir E')
      await expect(option).toHaveCount(1)
      await expect(option.first()).toContainText('Place the pin yourself')

      test.info().annotations.push({
        type: 'provider-coverage',
        description:
          'The configured provider has no record of this street. Expected with ' +
          'Nominatim. If a paid provider is configured and this branch still ' +
          'runs, check the API key before anything else.',
      })
      return
    }

    // The provider found it. Selecting the first row must land the map on a
    // real point, with the chip showing the address rather than a coordinate.
    await option.first().click()
    const chip = page.getByTestId('map-search-chip')
    await expect(chip).toBeVisible({ timeout: 30_000 })
    await expect(chip).toContainText(/Bradenton|34208/)
  })
})
