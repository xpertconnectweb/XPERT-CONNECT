import { test, expect } from '../../fixtures/factories'

test.use({ storageState: '.auth/lawyer.json' })

/**
 * Memory: the map filters out items where lat===0 && lng===0 — they're
 * placeholder firms that shouldn't render. A clinic with (0, 0) coords
 * should never appear in the map's marker layer.
 */
test('a clinic with (0, 0) coords is hidden from the map', async ({
  page,
  createClinic,
  ns,
}) => {
  const placeholder = await createClinic({
    name: `${ns}placeholder-no-coords`,
    lat: 0,
    lng: 0,
  })

  await page.goto('/professionals/map')
  // Wait for the map to settle.
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})

  // Searching for the clinic by name — it must not appear. Records at (0,0)
  // are dropped when the search index is built, so no query can surface them.
  const search = page.getByTestId('map-search-input')
  await expect(search).toBeVisible({ timeout: 30_000 })
  await search.fill(placeholder.name as string)

  // Wait briefly for the filter to apply.
  await page.waitForTimeout(800)

  // Scoped to "does the clinic appear as a RESULT", not to "is this string
  // anywhere in the document".
  //
  // This used to be `getByText(name).toHaveCount(0)`, which passed only because
  // nothing on the page echoed the query back. The search box now does: when a
  // lookup finds nothing it says `No match for "<what you typed>"`, so the
  // clinic's name IS on screen — inside a message saying it was not found,
  // which is the opposite of the regression this guards against.
  //
  // Nor can it assert there are no options at all: with no match the dropdown
  // offers "Place the pin yourself", and that is a real, selectable option.
  // What must be true is that no option and no panel row NAMES this clinic.
  const named = new RegExp(placeholder.name as string, 'i')
  await expect(page.getByTestId('map-search-option').filter({ hasText: named })).toHaveCount(0)
  await expect(
    page.getByTestId('map-panel-list').getByText(placeholder.name as string)
  ).toHaveCount(0)
})
