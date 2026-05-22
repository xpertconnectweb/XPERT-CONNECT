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

  // Searching the side panel for the clinic name — it should not appear.
  // MapView's filter is the only relevant input here ("Filter by name,
  // specialty..."); /search/i used to match nothing on this page (the page
  // has no "Search" placeholder), which silently no-op'd the filter.
  const search = page.getByPlaceholder('Filter by name, specialty')
  if (await search.count()) {
    await search.fill(placeholder.name as string)
  }

  // Wait briefly for the filter to apply.
  await page.waitForTimeout(800)

  await expect(page.getByText(placeholder.name as string)).toHaveCount(0)
})
