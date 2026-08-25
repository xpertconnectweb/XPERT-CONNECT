import { test, expect } from '../../fixtures/factories'

const noPartner = () => !process.env.E2E_PARTNER_USER || !process.env.E2E_PARTNER_PASS

test('partner dashboard renders without errors', async ({ page }) => {
  test.skip(noPartner(), 'Partner credentials not configured')

  await page.goto('/partners/dashboard')
  await expect(page.getByRole('heading')).toBeVisible({ timeout: 15_000 })
})

/**
 * This file used to assert that a partner could confirm an assigned case from
 * the dashboard. That feature does not exist, and never did — the test simply
 * never ran, because the partner project could not authenticate.
 *
 * What actually exists: `/api/partners/referrals` has GET and POST only, the
 * page's single mutation is opening a detail modal, and `case_confirmed` is
 * writable exclusively by an admin through
 * `/api/admin/referrer-referrals/[id]`. On the partner side it is a read-only
 * badge.
 *
 * So these assert the contract the portal really has: a partner sees their own
 * referrals, cannot see anybody else's, and can read the case state. Whether
 * partners *should* be able to confirm is a product question, not something to
 * fake here.
 */
test.describe('partner referrals', () => {
  test.skip(noPartner(), 'Partner credentials not configured')

  test('partner sees their own referral and can filter to it', async ({
    page,
    createReferrerReferral,
    ns,
  }) => {
    const referral = await createReferrerReferral({
      clientName: `${ns}client-visible`,
      status: 'assigned',
    })

    await page.goto('/partners/referrals')
    await page
      .getByPlaceholder('Search client or case type')
      .fill(referral.client_name)

    await expect(page.getByText(referral.client_name).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('the feed is scoped to the logged-in partner', async ({
    page,
    createReferrerReferral,
    createUser,
    ns,
  }) => {
    // A referral belonging to somebody else must not leak into this partner's
    // list — the whole feed is `getReferrerReferralsByReferrer(user.id)`.
    const stranger = await createUser({ role: 'partner', username: `${ns}other-partner` })
    const theirs = await createReferrerReferral({
      referrerId: stranger.id,
      clientName: `${ns}client-someone-else`,
    })

    await page.goto('/partners/referrals')
    await page.getByPlaceholder('Search client or case type').fill(theirs.client_name)

    await expect(page.getByText(theirs.client_name)).toHaveCount(0)
  })

  test('case confirmation is shown to the partner as read-only', async ({
    page,
    createReferrerReferral,
    ns,
  }) => {
    const referral = await createReferrerReferral({
      clientName: `${ns}client-detail`,
      status: 'assigned',
      caseConfirmed: 'pending',
    })

    await page.goto('/partners/referrals')
    await page.getByPlaceholder('Search client or case type').fill(referral.client_name)
    // The row is not itself clickable — the modal opens from a dedicated
    // "View details" button in the last cell.
    await page
      .getByRole('row')
      .filter({ hasText: referral.client_name })
      .getByRole('button', { name: /view details/i })
      .click()

    const modal = page.locator('div.fixed.inset-0')
    await expect(modal.getByText('Case Confirmed')).toBeVisible({ timeout: 15_000 })
    // Read-only: there is no control here that could change it.
    await expect(modal.getByRole('button', { name: /confirm|accept/i })).toHaveCount(0)
  })
})
