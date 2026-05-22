import { test, expect } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'

test('partner dashboard renders without errors', async ({ page }) => {
  // Skip entirely if no partner credentials provisioned.
  test.skip(
    !process.env.E2E_PARTNER_USER || !process.env.E2E_PARTNER_PASS,
    'Partner demo credentials not configured',
  )

  await page.goto('/partners/dashboard')
  await expect(page.getByRole('heading')).toBeVisible({ timeout: 15_000 })
})

test('partner can confirm an assigned case from the dashboard', async ({
  page,
  createReferral,
  ns,
}) => {
  test.skip(
    !process.env.E2E_PARTNER_USER || !process.env.E2E_PARTNER_PASS,
    'Partner demo credentials not configured',
  )

  const referral = await createReferral({
    patient_name: `${ns}partner-case`,
    status: 'assigned',
  })

  await page.goto('/partners/referrals')
  await page.getByPlaceholder('Search client or case type').fill(referral.patient_name as string)

  await page
    .getByRole('button', { name: /confirm|accept case|accept/i })
    .first()
    .click()

  await expect(page.getByText(/(confirmed|accepted)/i)).toBeVisible({ timeout: 15_000 })

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('referrals')
    .select('status')
    .eq('id', referral.id)
    .single()
  expect(['confirmed', 'in_process', 'accepted']).toContain(data?.status)
})
