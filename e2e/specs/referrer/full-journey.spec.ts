import { test, expect } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'

test('referrer picks a state, submits a referral and tracks it in my-referrals', async ({
  page,
  ns,
}) => {
  // Suffix with a per-run random to keep uniqueness even if a prior run's
  // teardown didn't sweep — `.single()` errors when >1 row matches.
  const patientName = `${ns}referrer-patient-${Math.random().toString(36).slice(2, 8)}`

  await page.goto('/professionals/refer')

  // State picker — choose Florida (button shows "FL" + "Florida").
  await page.getByRole('button', { name: /florida/i }).click()

  // ReferrerReferralForm labels don't use htmlFor, so target by placeholder.
  // Required fields: client name, phone, address, service-needed radio, case
  // type. Email + notes are optional.
  await page.getByPlaceholder('Full name').fill(patientName)
  await page.getByPlaceholder('(555) 123-4567').fill('305-555-0701')
  await page.getByPlaceholder('client@example.com').fill(`${ns}referrer@e2e.test`)
  await page.getByPlaceholder('Street, City, State, ZIP').fill('1 E2E Way, Miami, FL 33101')
  // "Service Needed" is a radio group. Pick "Clinic".
  await page.getByRole('radio', { name: /clinic/i }).check()
  await page.getByPlaceholder(/personal injury/i).fill('Auto Accident')
  // Date of Accident is required (no htmlFor on the label — there's only one
  // `<input type="date">` on this form, so scope by type).
  await page.locator('input[type="date"]').fill('2026-05-01')

  await page.getByRole('button', { name: /submit|send|refer/i }).first().click()

  // Confirmation page renders an h2 "Referral Submitted!" plus a body line —
  // match the heading specifically to avoid a strict-mode violation.
  await expect(
    page.getByRole('heading', { name: /referral submitted/i }),
  ).toBeVisible({ timeout: 15_000 })

  // Now confirm the row in my-referrals. The patient name may be rendered
  // multiple times (table + collapsed detail card on the same page), so
  // assert at least one occurrence is visible.
  await page.goto('/professionals/my-referrals')
  await expect(page.getByText(patientName).first()).toBeVisible({ timeout: 15_000 })

  // Referrer flows write to the `referrer_referrals` table (client_name),
  // NOT the `referrals` table (patient_name) used by clinic/lawyer flows.
  // See src/lib/data.ts RREF_COLUMNS + createReferrerReferral().
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('referrer_referrals')
    .select('id, client_name, state, status')
    .eq('client_name', patientName)
    .single()
  expect(data?.client_name).toBe(patientName)
  expect(data?.status).toBe('received')
  if (data?.id) {
    await supabase.from('referrer_referrals').delete().eq('id', data.id)
  }
})
