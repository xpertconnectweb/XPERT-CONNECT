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

  await expect(page.getByText(placeholder.name as string)).toHaveCount(0)
})
