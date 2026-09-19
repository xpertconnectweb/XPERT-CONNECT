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

  // The client's own Data sharing wording. The second sentence is the
  // one that does work the rest of the policy cannot: it carves mobile
  // opt-in data out of every other sharing clause on the page.
  await expect(
    page.getByText(/mobile opt-in and consent are never shared with anyone for any purpose/i)
  ).toBeVisible()
})

test('the privacy policy carries the messaging terms at a linkable anchor', async ({ page }) => {
  // /privacy#messaging-terms is the URL handed to a carrier reviewer,
  // so the id matters as much as the text. Losing either turns the
  // link in the verification form into a scroll to nowhere.
  await page.goto('/privacy#messaging-terms')

  const terms = page.locator('#messaging-terms')
  await expect(terms).toBeVisible()
  await expect(
    terms.getByRole('heading', { name: /844 Xpert LLC Messaging Terms and Conditions/i })
  ).toBeVisible()

  // Six clauses, numbered by the browser rather than by hand.
  await expect(terms.locator('ol > li')).toHaveCount(6)

  // The heading has to survive in the page SOURCE as one unbroken
  // string. `{COMPANY_LEGAL_NAME} Messaging Terms...` renders as
  // `844 Xpert LLC<!-- --> Messaging Terms...`, which getByRole above
  // still matches - accessible names ignore comments - but a reviewer
  // grepping the source does not.
  expect(await page.content()).toContain('844 Xpert LLC Messaging Terms and Conditions')

  // Deliberately the literal address, not the constant: a test that
  // imports SMS_HELP_EMAIL and finds SMS_HELP_EMAIL proves nothing.
  // This address is what was filed with the carrier.
  await expect(terms.locator('a[href="mailto:4xpertconnect@gmail.com"]')).toBeVisible()

  await expect(terms.getByText(/carriers are not liable for delayed or undelivered messages/i)).toBeVisible()
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
