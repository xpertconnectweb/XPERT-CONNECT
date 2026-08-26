import { test, expect } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'
import { mockGeocode } from '../../helpers/geocode-mock'

/**
 * Creating a clinic without typing coordinates.
 *
 * The admin form used to ask for latitude and longitude as two number fields
 * with `parseFloat(e.target.value) || 0` behind them, and the POST handler
 * inserted whatever arrived. An empty field became 0, and 0, 0 — the Gulf of
 * Guinea — became a clinic. Those rows are still in the table, hidden from the
 * map by `hasRealCoordinates` at index time.
 *
 * This asserts the two halves of the fix: picking an address sets the
 * coordinates, and the server refuses the bad ones regardless of what the form
 * does.
 */
test('picking an address sets the coordinates, with no numbers typed', async ({ page, ns }) => {
  test.slow()
  await mockGeocode(page)

  const name = `${ns}clinic-geo-${Date.now()}`

  await page.goto('/admin/clinics')
  await page.getByRole('button', { name: /new clinic/i }).click()
  await page.getByPlaceholder('Clinic Name').fill(name)

  const address = page.getByTestId('clinic-address-input')
  await address.fill('1000 Legion Pl, Orlando')

  const option = page.getByTestId('clinic-address-option').first()
  await expect(option).toBeVisible()
  await option.click()

  // The resolved line is the visible proof: coordinates and a precision the
  // admin never typed.
  const resolved = page.getByTestId('clinic-address-resolved')
  await expect(resolved).toBeVisible()
  await expect(resolved).toContainText('28.53830')
  await expect(resolved).toContainText('rooftop')

  await page.getByPlaceholder('info@clinic.com').fill(`${ns}geo@e2e.test`)
  await page.getByRole('button', { name: /^save$|create|submit/i }).click()

  const supabase = createServiceClient()
  await expect
    .poll(async () => {
      const { data } = await supabase
        .from('clinics')
        .select('id, lat, lng, city, state, place_id')
        .eq('name', name)
        .maybeSingle()
      return data
    }, { timeout: 15_000 })
    .toMatchObject({ city: 'Orlando', state: 'FL' })

  const { data } = await supabase.from('clinics').select('id, lat, lng').eq('name', name).single()
  // The assertion that matters: not the Gulf of Guinea.
  expect(data?.lat).not.toBe(0)
  expect(data?.lng).not.toBe(0)
  expect(Math.abs(Number(data?.lat) - 28.5383)).toBeLessThan(0.01)

  if (data?.id) await supabase.from('clinics').delete().eq('id', data.id)
})

/**
 * The server is the real gate.
 *
 * The manual-coordinates disclosure still exists, so the form can still post
 * anything. This is the check that used to be missing entirely.
 */
test('the API refuses a clinic at 0, 0', async ({ page }) => {
  const response = await page.request.post('/api/admin/clinics', {
    data: {
      name: 'Nowhere Clinic',
      address: 'Somewhere, FL',
      lat: 0,
      lng: 0,
      phone: '',
      email: '',
      specialties: [],
    },
  })

  expect(response.status()).toBe(400)
  expect(await response.text()).toContain('0, 0')
})

test('the API refuses coordinates outside the United States', async ({ page }) => {
  const response = await page.request.post('/api/admin/clinics', {
    data: {
      name: 'London Clinic',
      address: 'London',
      lat: 51.5,
      lng: -0.12,
      phone: '',
      email: '',
      specialties: [],
    },
  })

  expect(response.status()).toBe(400)
})
