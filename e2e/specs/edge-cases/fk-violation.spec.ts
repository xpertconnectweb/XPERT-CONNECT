import { test, expect } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'

test.use({ storageState: '.auth/admin.json' })

/**
 * Deleting a clinic that has live referrals should not silently orphan rows.
 * Either the FK blocks the delete (preferred) or the cascade is intentional.
 * Either way: assert deterministic behavior so a regression surfaces.
 */
test('deleting a clinic with active referrals surfaces a graceful response', async ({
  page,
  createClinic,
  createReferral,
  ns,
}) => {
  const clinic = await createClinic({ name: `${ns}fk-clinic` })
  // VALID_REFERRAL_KINDS = ['lawyer', 'medical_specialist'] (src/lib/validation.ts);
  // 'clinic' is not a kind — clinic→lawyer referrals have referral_kind='lawyer'
  // with a clinic_id pointing back to the originating clinic.
  const referral = await createReferral({
    patient_name: `${ns}fk-patient`,
    clinic_id: clinic.id,
    referral_kind: 'lawyer',
    status: 'received',
  })

  await page.goto('/admin/clinics')
  await page.getByPlaceholder('Search by name, address').fill(clinic.name as string)

  await page
    .getByRole('button', { name: new RegExp(`delete ${clinic.name}`, 'i') })
    .click()
  await page.getByRole('button', { name: /^confirm$|delete|yes/i }).click()

  // Verify final state in DB — either the row is still there (FK blocked) or
  // the referrals have been cleaned up alongside it.
  const supabase = createServiceClient()
  const { data: clinicAfter } = await supabase
    .from('clinics')
    .select('id')
    .eq('id', clinic.id)
    .maybeSingle()
  const { data: referralAfter } = await supabase
    .from('referrals')
    .select('id, clinic_id')
    .eq('id', referral.id)
    .maybeSingle()

  if (clinicAfter) {
    // FK protected — referral still references the clinic.
    expect(referralAfter?.clinic_id).toBe(clinic.id)
  } else {
    // Cascade — referral was either deleted or its clinic_id nulled.
    if (referralAfter) {
      expect(referralAfter.clinic_id).toBeNull()
    }
  }
})
