import { test, expect } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'
import { expectAdminRow } from '../../helpers/admin'

test('admin can create a clinic and see it in the table', async ({ page, ns }) => {
  test.slow()

  const name = `${ns}clinic-${Date.now()}`

  await page.goto('/admin/clinics')
  await page.getByRole('button', { name: /new clinic/i }).click()

  // Use unique placeholder substrings — `/address/i` and `/medical plaza/i`
  // also match the "Search by name, address, region, county..." table filter,
  // and `/chiropractic|physical therapy/i` could match any future search-style
  // input that mentions specialties.
  await page.getByPlaceholder('Clinic Name').fill(name)
  await page.getByPlaceholder('123 Medical Plaza').fill('1 E2E Way, Miami, FL 33101')
  await page.getByPlaceholder('25.7617').fill('25.7617')
  await page.getByPlaceholder('-80.1918').fill('-80.1918')
  await page.getByPlaceholder('+1 (305) 555-0123').fill('305-555-0100')
  await page.getByPlaceholder('info@clinic.com').fill(`${ns}c@e2e.test`)
  await page
    .getByPlaceholder('Chiropractic, Physical Therapy')
    .fill('Chiropractic, Physical Therapy')

  await page.getByRole('button', { name: /^save$|create|submit/i }).click()

  // Name appears both in the name cell (with specialties beneath) and in the
  // "View emails for <name>" / "Edit <name>" action buttons' accessible names,
  // so a non-exact cell match resolves to multiple cells. Match the row
  // instead — its accessible name uniquely contains the namespaced clinic.
  await expectAdminRow(page, name)

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('clinics')
    .select('id, name, available')
    .eq('name', name)
    .single()
  expect(data?.name).toBe(name)

  // Cleanup — created via UI so not auto-tracked by the fixture.
  if (data?.id) {
    await supabase.from('clinics').delete().eq('id', data.id)
  }
})

test('admin can edit an existing clinic name', async ({ page, createClinic, ns }) => {
  test.slow()

  const original = await createClinic({ name: `${ns}orig` })
  const updated = `${ns}updated`

  await page.goto('/admin/clinics')
  // Filter by the ns prefix so the row still matches after the rename;
  // filtering by original.name would hide the row once the name flips to
  // updated, and the cell-visible assertion would fail.
  await page.getByPlaceholder('Search by name, address').fill(ns)
  await page.getByRole('button', { name: new RegExp(`edit ${original.name}`, 'i') }).click()

  const nameInput = page.getByPlaceholder('Clinic Name')
  await nameInput.fill(updated)
  await page.getByRole('button', { name: /^save$|update/i }).click()

  await expectAdminRow(page, updated)
})
