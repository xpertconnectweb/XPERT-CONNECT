import { test, expect } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'

/**
 * The opt-in screen.
 *
 * A screenshot of this page is what gets submitted to Twilio as proof
 * of the opt-in workflow, so the assertions below are the things a
 * carrier reviewer checks — the box starts unchecked, the disclosures
 * are on screen, and nothing can be sent until consent is given.
 *
 * The end of the flow (receiving an actual code) needs live Twilio
 * credentials, so that part is skipped unless they are configured.
 */

/**
 * `next dev` compiles routes on demand, and the first visit here has
 * to build the page, the dashboard shell and /api/me/notifications —
 * during which individual requests take five to eight seconds. That
 * is harness cost, not product latency, so the budget here is
 * generous on purpose. Anything that fails inside two minutes is a
 * real failure.
 */
test.describe('clinic user opts in to SMS alerts', () => {
  test.describe.configure({ timeout: 120_000 })

  test.beforeEach(async ({ page }) => {
    await page.goto('/professionals/notifications')
    await page.getByTestId('sms-settings').waitFor({ state: 'visible', timeout: 60_000 })
  })

  test('consent starts unchecked and gates the send button', async ({ page }) => {
    const consent = page.getByTestId('sms-consent-checkbox')
    const sendCode = page.getByTestId('sms-send-code')

    // Pre-ticking this box, or implying consent from the act of
    // typing a number, is the single most common TCPA finding.
    await expect(consent).not.toBeChecked()
    await expect(sendCode).toBeDisabled()

    await page.getByTestId('sms-phone-input').fill('4075550142')
    // Still disabled: a phone number is not consent.
    await expect(sendCode).toBeDisabled()

    await consent.check()
    await expect(sendCode).toBeEnabled()
  })

  test('the full consent text is on screen, not hidden behind a link', async ({ page }) => {
    const consentBlock = page.getByTestId('sms-consent-checkbox').locator('..')

    await expect(consentBlock).toContainText(/message and data rates may apply/i)
    await expect(consentBlock).toContainText(/reply stop/i)
    await expect(consentBlock).toContainText(/consent is not a condition/i)
    await expect(consentBlock).toContainText(/no patient information/i)
  })

  test('a number that is not a US mobile is refused before anything is sent', async ({ page }) => {
    await page.getByTestId('sms-phone-input').fill('305-555')
    await page.getByTestId('sms-consent-checkbox').check()
    await page.getByTestId('sms-send-code').click()

    await expect(page.getByTestId('sms-error')).toBeVisible({ timeout: 15_000 })
  })

  test('the account starts with alerts off in the database', async ({ page }) => {
    // Nobody may be opted in by default, by a migration, or by an
    // admin. Asserted against the row, not the UI.
    const username = process.env.E2E_CLINIC_USER
    test.skip(!username, 'E2E_CLINIC_USER not configured')

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('users')
      .select('sms_referral_alerts, phone_verified_at')
      .eq('username', username!)
      .single()

    // Skips rather than fails when the column is absent, because that
    // means scripts/migrations/2026-08-sms-notifications.sql has not
    // been applied to this database yet — a missing prerequisite, not
    // a broken product. Every other assertion in this file is UI-only
    // and still runs.
    test.skip(
      /column .* does not exist/i.test(error?.message ?? ''),
      'SMS migration not applied to this database yet'
    )
    expect(error).toBeNull()

    expect(data?.sms_referral_alerts ?? false).toBe(false)

    // And the UI agrees rather than claiming otherwise.
    await expect(page.getByTestId('sms-phone-input')).toBeVisible()
  })
})
