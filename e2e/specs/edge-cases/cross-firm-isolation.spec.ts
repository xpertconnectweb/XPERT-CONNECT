import { test, expect } from '../../fixtures/factories'

test.use({ storageState: '.auth/lawyer.json' })

/**
 * Allowlist memory: lawyer authorization is by firm membership, NOT user.id.
 * Lawyer A must not be able to read referrals belonging to firm B via the API.
 */
test('a lawyer cannot read referrals from a different firm', async ({
  page,
  request,
  createClinic,
  createLawyer,
  createReferral,
  ns,
}) => {
  // referrals.clinic_id is NOT NULL — even a clinic→lawyer referral records
  // the originating clinic. Create one we can attach to.
  const sourceClinic = await createClinic({ name: `${ns}src-clinic` })
  const otherFirm = await createLawyer({ name: `${ns}other-firm` })
  const otherRef = await createReferral({
    patient_name: `${ns}other-patient`,
    clinic_id: sourceClinic.id,
    lawyer_id: otherFirm.id,
    referral_kind: 'lawyer',
    status: 'received',
  })

  // /api/professionals/referrals/[id] only exposes PATCH + DELETE — there is
  // no single-resource GET, so use the list endpoint (firm-scoped) and assert
  // the other firm's referral is not visible to this lawyer.
  const list = await page.request.get('/api/professionals/referrals')
  expect(list.ok(), `GET /referrals returned ${list.status()}`).toBe(true)
  const body = (await list.json()) as Array<{ id: string }>
  const ids = body.map((r) => r.id)
  expect(ids).not.toContain(otherRef.id)

  // suppress unused warnings
  void request
})
