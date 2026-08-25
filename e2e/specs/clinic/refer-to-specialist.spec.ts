import { test, expect } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'

test('clinic "Refer to Lawyer" CTA submits a lawyer referral via the modal', async ({
  page,
  createLawyer,
  ns,
}) => {
  test.setTimeout(120_000)
  const firm = await createLawyer({ name: `${ns}target-firm`, available: true })

  await page.goto('/professionals')

  // ClinicDashboard renders two CTAs. Click the lawyer one specifically.
  await page.getByRole('button', { name: /refer to lawyer/i }).click()

  // Modal opens with a lawyer picker (no preset). The lawyer list is fetched
  // from /api/professionals/lawyers asynchronously — wait for our e2e firm to
  // appear as an option before selecting.
  const lawyerPicker = page.locator('select').filter({ hasText: firm.name as string }).first()
  await expect(lawyerPicker).toBeVisible({ timeout: 45_000 })
  await lawyerPicker.selectOption(firm.id)

  const patientName = `${ns}patient`
  await page.locator('#patientName').fill(patientName)
  await page.locator('#patientPhone').fill('305-555-0601')
  await page.locator('#caseType').selectOption('Auto Accident')
  // accidentDate is now required on ClinicReferralFormModal (added May 2026).
  await page.locator('#accidentDate').fill('2026-05-01')

  const [postResp] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().includes('/api/professionals/referrals') &&
        r.request().method() === 'POST',
      { timeout: 30_000 }
    ),
    page.getByRole('button', { name: /^send referral$/i }).click(),
  ])
  const respBody = await postResp.text()
  expect(
    postResp.status(),
    `referrals POST failed: ${respBody}`
  ).toBeLessThan(400)

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('referrals')
    .select('id, patient_name, lawyer_id, referral_kind')
    .eq('patient_name', patientName)
    .single()
  expect(data?.patient_name).toBe(patientName)
  expect(data?.lawyer_id).toBe(firm.id)
  expect(data?.referral_kind).toBe('lawyer')
  if (data?.id) {
    await supabase.from('referrals').delete().eq('id', data.id)
  }
})

/**
 * The Refer button on the specialists list used to be
 * `onClick={() => setReferOpen(true)}` with the clinic dropped on the floor,
 * so the modal opened with no destination and asked the user to pick the
 * specialist they had just pressed Refer on.
 */
test('the specialists list pre-selects the specialist that was clicked', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto('/professionals/specialists')
  // Scoped to the list: 'ul > li' also matches the sidebar navigation.
  const rows = page.getByTestId('specialist-row')
  await expect(rows.first()).toBeVisible({ timeout: 45_000 })

  const name = (await rows.first().innerText()).split('\n')[0].trim()
  await rows.first().getByRole('button', { name: new RegExp(`refer a patient to`, 'i') }).click()

  // The modal names the destination instead of offering a picker.
  await expect(page.getByText(/sending to/i)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(name, { exact: false }).first()).toBeVisible()
})
