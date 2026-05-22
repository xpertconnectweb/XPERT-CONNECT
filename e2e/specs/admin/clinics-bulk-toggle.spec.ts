import { test, expect } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'

test('admin can bulk-toggle availability on multiple clinics', async ({
  page,
  createClinic,
  ns,
}) => {
  const a = await createClinic({ name: `${ns}bulk-a`, available: true })
  const b = await createClinic({ name: `${ns}bulk-b`, available: true })
  const c = await createClinic({ name: `${ns}bulk-c`, available: true })

  await page.goto('/admin/clinics')
  await page.getByPlaceholder('Search by name, address').fill(ns)

  for (const clinic of [a, b, c]) {
    const row = page.getByRole('row', { name: new RegExp(clinic.name as string) })
    await row.getByRole('checkbox').check()
  }

  // BulkActionBar labels the button "Make Unavailable" (not "Mark…").
  await page
    .getByRole('button', { name: /make unavailable|toggle availability/i })
    .click()
  await page.getByRole('button', { name: /confirm|yes/i }).click()

  // After a successful bulk toggle the page clears selection (so the action
  // bar disappears) and refetches clinics. Wait for the bar to go before
  // reading the DB so we don't race the in-flight PATCH.
  await expect(page.getByText(/\d+ selected/i)).toHaveCount(0, { timeout: 15_000 })

  const supabase = createServiceClient()
  // Poll the DB — the PATCH /api/admin/clinics/bulk and the subsequent
  // fetchClinics() refresh can still be settling when expect.poll fires.
  await expect
    .poll(
      async () => {
        const { data } = await supabase
          .from('clinics')
          .select('id, available')
          .in('id', [a.id, b.id, c.id])
        return data?.every((row) => row.available === false) ?? false
      },
      { timeout: 15_000, intervals: [200, 500, 1000] },
    )
    .toBe(true)
})
