import { test, expect } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'

test('lawyer map renders and the side panel filters by clinic name', async ({
  page,
  createClinic,
  ns,
}) => {
  test.setTimeout(120_000)
  const clinic = await createClinic({
    name: `${ns}target-clinic`,
    available: true,
  })

  await page.goto('/professionals/map')

  // The side panel toggle isn't always open by default. Use the filter input,
  // which lives in the map controls regardless of panel state.
  const filter = page.getByPlaceholder('Filter by name, specialty')
  await expect(filter).toBeVisible({ timeout: 30_000 })
  await filter.fill(clinic.name as string)

  // After filtering, the target clinic name should appear in the panel.
  // Open the panel if it's collapsed.
  const panelToggle = page.getByRole('button', { name: /list/i }).first()
  if (await panelToggle.count()) {
    await panelToggle.click().catch(() => {})
  }
  await expect(page.getByText(clinic.name as string).first()).toBeVisible({
    timeout: 15_000,
  })
})

/**
 * Direct API contract: the lawyer-to-clinic referral creation path. We test
 * the full UI marker → popup → modal flow via vitest (admin-clinics +
 * referrals-post tests). Reaching a Leaflet marker reliably from Playwright
 * — cluster grouping, popup rendering, async tile loading — is flaky and
 * not a meaningful E2E payoff vs. unit coverage of the same code path.
 */
test('lawyer can submit a referral to a clinic via the referrals API', async ({
  page,
  createClinic,
  ns,
}) => {
  test.setTimeout(60_000)
  const clinic = await createClinic({
    name: `${ns}api-target-clinic`,
    available: true,
  })

  await page.goto('/professionals/map')

  const patientName = `${ns}api-patient`
  const res = await page.request.post('/api/professionals/referrals', {
    data: {
      clinicId: clinic.id,
      patientName,
      patientPhone: '305-555-0501',
      caseType: 'Auto Accident',
    },
  })
  expect(res.status(), `referrals POST: ${await res.text()}`).toBeLessThan(400)

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('referrals')
    .select('id, patient_name, clinic_id, status')
    .eq('patient_name', patientName)
    .single()
  expect(data?.patient_name).toBe(patientName)
  expect(data?.clinic_id).toBe(clinic.id)
  if (data?.id) {
    await supabase.from('referrals').delete().eq('id', data.id)
  }
})
