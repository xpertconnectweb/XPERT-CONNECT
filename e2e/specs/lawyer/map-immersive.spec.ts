import { test, expect } from '@playwright/test'
import { mockGeocode } from '../../helpers/geocode-mock'

/**
 * Full-map mode: everything out of the way so the map can be read.
 *
 * The whole feature is a state that only exists after a press, which is the
 * category this codebase has repeatedly shipped broken — the "+N" that
 * revealed nothing, the suggestion that jumped nowhere. So the assertions here
 * are about what is actually gone, what is still reachable, and whether you
 * can get back out; not about a class name.
 */

test.describe('full-map mode', () => {
  test.beforeEach(async ({ page }) => {
    await mockGeocode(page)
    await page.goto('/professionals/map')
    await expect(page.getByTestId('map-results-summary')).toBeVisible({ timeout: 30_000 })
  })

  test('puts the search box and the results away, and brings them back', async ({ page }) => {
    const toggle = page.getByTestId('map-immersive-toggle')
    await expect(page.getByTestId('map-search-input')).toBeVisible()

    await toggle.click()

    await expect(page.getByTestId('map-search-input')).toBeHidden()
    await expect(page.getByTestId('map-results-summary')).toBeHidden()
    await expect(page.getByTestId('map-filter-chip').first()).toBeHidden()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    // The map itself, and the way out, are the two things that must survive.
    await expect(page.getByTestId('map-shell')).toBeVisible()
    await expect(toggle).toBeVisible()

    await toggle.click()
    await expect(page.getByTestId('map-search-input')).toBeVisible()
    await expect(page.getByTestId('map-results-summary')).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('Escape gets out of it', async ({ page }) => {
    // A mode that hides the navigation has to answer the key people press when
    // something has taken over the screen. The button being there is not
    // enough if it is ever missed.
    await page.getByTestId('map-immersive-toggle').click()
    await expect(page.getByTestId('map-search-input')).toBeHidden()

    await page.keyboard.press('Escape')

    await expect(page.getByTestId('map-search-input')).toBeVisible()
  })

  test('covers the app chrome rather than sitting inside it', async ({ page }) => {
    // The sidebar and the top bar belong to a layout that knows nothing about
    // this mode, so the map has to cover them. Measured, because "the map got
    // bigger" is the entire point of the feature.
    const before = await page.getByTestId('map-shell').boundingBox()
    await page.getByTestId('map-immersive-toggle').click()
    await expect(page.getByTestId('map-search-input')).toBeHidden()
    const after = await page.getByTestId('map-shell').boundingBox()

    if (!before || !after) throw new Error('no map shell')
    expect(after.width).toBeGreaterThan(before.width)
    expect(after.x).toBeLessThan(before.x)

    const viewport = page.viewportSize()
    if (viewport) expect(after.width).toBeCloseTo(viewport.width, 0)
  })

  test('leaves the filters as they were', async ({ page }) => {
    // Hiding a control must not reset what it was holding. The mode is a way
    // of looking, not a way of clearing.
    const chip = page.getByTestId('map-filter-chip').first()
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    const scoped = await page.getByTestId('map-results-summary').innerText()

    await page.getByTestId('map-immersive-toggle').click()
    await page.getByTestId('map-immersive-toggle').click()

    await expect(page.getByTestId('map-filter-chip').first()).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(page.getByTestId('map-results-summary')).toHaveText(scoped)
  })
})

test.describe('full-map mode on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('takes the whole screen and still offers a way back', async ({ page }) => {
    await mockGeocode(page)
    await page.goto('/professionals/map')
    await expect(page.getByTestId('map-results-summary')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('map-immersive-toggle').click()

    // The bottom sheet is the phone's results list; in this mode it is gone.
    await expect(page.getByTestId('map-results-sheet')).toBeHidden()
    await expect(page.getByTestId('map-search-input')).toBeHidden()
    await expect(page.getByTestId('map-immersive-toggle')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('map-search-input')).toBeVisible()
  })
})
