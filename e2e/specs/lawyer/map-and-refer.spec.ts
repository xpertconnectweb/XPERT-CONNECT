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

  // One search box now covers both jobs the two old inputs did.
  const search = page.getByTestId('map-search-input')
  await expect(search).toBeVisible({ timeout: 30_000 })
  await search.fill(clinic.name as string)

  // The results panel is docked at desktop widths and an overlay below them,
  // so open it only when it is not already showing.
  const panelToggle = page.getByTestId('map-panel-toggle')
  if ((await panelToggle.getAttribute('aria-expanded')) !== 'true') {
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
