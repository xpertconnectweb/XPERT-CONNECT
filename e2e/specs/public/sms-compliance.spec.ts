import { test, expect } from '../../fixtures/factories'

/**
 * The public half of the SMS compliance surface.
 *
 * These pages exist because the opt-in screen sits behind a login and
 * the carrier reviewing our toll-free application cannot see it. If
 * either page 404s or loses its required disclosure, the verification
 * gets rejected — which costs days, not minutes. Worth a spec.
 */

test('the SMS terms page is public and carries the required disclosures', async ({ page }) => {
  const res = await page.goto('/sms-terms')
  expect(res?.status()).toBe(200)

  // The sentence carriers look for specifically.
  await expect(
    page.getByText(/no mobile information will be sold or shared/i)
  ).toBeVisible()

  // .first() because these also appear inside the reproduced consent
  // paragraph at the foot of the page — which is itself the point:
  // the disclosure and the consent text must agree word for word.
  await expect(page.getByText(/message and data rates may apply/i).first()).toBeVisible()
  await expect(page.getByText(/reply\s+stop/i).first()).toBeVisible()
  await expect(page.getByText(/message frequency/i).first()).toBeVisible()

  // The promise the whole no-PHI design rests on.
  await expect(page.getByText(/never contain patient names/i)).toBeVisible()
})

test('the privacy policy is public and repeats the mobile opt-in clause', async ({ page }) => {
  const res = await page.goto('/privacy')
  expect(res?.status()).toBe(200)

  await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible()
  await expect(
    page.getByText(/no mobile information will be sold or shared/i)
  ).toBeVisible()
})

test('the footer links to both, rather than to href="#"', async ({ page }) => {
  await page.goto('/')

  const privacy = page.getByRole('link', { name: /privacy policy/i }).first()
  const smsTerms = page.getByRole('link', { name: /sms terms/i }).first()

  await expect(privacy).toHaveAttribute('href', '/privacy')
  await expect(smsTerms).toHaveAttribute('href', '/sms-terms')
})

test('the inbound webhook refuses an unsigned request', async ({ request }) => {
  // The signature check is the only door on this route — middleware
  // does not match /api/*. If this ever returns 200, anyone on the
  // internet can forge a STOP for any number.
  const res = await request.post('/api/sms/inbound', {
    form: { From: '+13055551212', Body: 'STOP' },
  })

  expect([403, 500]).toContain(res.status())
  expect(res.status()).not.toBe(200)
})

test('the short link in every message resolves to the referrals page', async ({ page }) => {
  // '/r' is what buys the characters that keep an alert inside one
  // 160-character segment. If it 404s, every message is a dead link.
  const res = await page.goto('/r')
  expect(res?.status()).toBeLessThan(400)
  await expect(page).toHaveURL(/\/(professionals\/(referrals|login)|api\/auth)/)
})
