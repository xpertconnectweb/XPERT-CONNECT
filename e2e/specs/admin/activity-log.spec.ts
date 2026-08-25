import { test } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'
import { expectAdminRow } from '../../helpers/admin'

test('admin sees a fresh activity log entry after creating a clinic', async ({
  page,
  ns,
}) => {
  // Two table reloads in one test, each of which may sit behind a cold route
  // compile. See `expectAdminRow`.
  test.slow()

  const name = `${ns}log-clinic`
  const supabase = createServiceClient()

  await page.goto('/admin/clinics')
  await page.getByRole('button', { name: /new clinic/i }).click()
  // Unique substrings — `/address/i` collides with the page's search bar
  // ("Search by name, address, region, county..."), and the specialties
  // regex was equally fragile.
  await page.getByPlaceholder('Clinic Name').fill(name)
  await page.getByPlaceholder('123 Medical Plaza').fill('1 E2E Log Rd, Miami, FL 33101')
  await page.getByPlaceholder('25.7617').fill('25.7617')
  await page.getByPlaceholder('-80.1918').fill('-80.1918')
  await page.getByPlaceholder('+1 (305) 555-0123').fill('305-555-0300')
  await page.getByPlaceholder('info@clinic.com').fill(`${ns}log@e2e.test`)
  await page.getByPlaceholder('Chiropractic, Physical Therapy').fill('Chiropractic')
  await page.getByRole('button', { name: /^save$|create|submit/i }).click()
  // Row match instead of cell — the name appears in the action buttons too.
  await expectAdminRow(page, name)

  await page.goto('/admin/activity')
  // Match the table row that mentions our unique clinic name. The bare
  // "Clinic Created" text also lives in the action filter dropdown
  // (<option>Clinic Created</option>), which made a free-text match
  // strict-mode-violating.
  await expectAdminRow(page, name)

  const { data } = await supabase.from('clinics').select('id').eq('name', name).single()
  if (data?.id) {
    await supabase.from('clinics').delete().eq('id', data.id)
  }
})
