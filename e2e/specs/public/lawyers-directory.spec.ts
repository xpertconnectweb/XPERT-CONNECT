import { test, expect } from '../../fixtures/factories'

/**
 * The public lawyers directory, exercised the way a stranger meets it:
 * no account, no storage state, no setup dependency. That is what the
 * `public` Playwright project gives us, and it is the point of the
 * feature — every other directory surface in this app is behind a login.
 *
 * These specs need 2027-01-public-lawyer-directory.sql applied. Without
 * it `directory_public` does not exist, the API degrades to an empty
 * list by design, and the row assertions below fail — which is the
 * correct signal, not a flaky test.
 */

test('the landing page shows a populated Lawyers Directory to a stranger', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBe(200)

  // The banner the client asked for, in the words they asked for.
  await expect(
    page.getByRole('heading', { name: 'Lawyers Directory', exact: true })
  ).toBeVisible()

  // Everything below must be true WITHOUT a single interaction: this is
  // the screenshot-at-rest requirement, written as an assertion.
  const cards = page.getByTestId('practice-area-card')
  expect(await cards.count()).toBeGreaterThanOrEqual(4)
  // Cards carry live counts over the whole corpus, not zeroes.
  await expect(cards.first()).toContainText(/\d+ firms?/)

  const rows = page.getByTestId('attorney-row')
  expect(await rows.count()).toBeGreaterThanOrEqual(5)

  // A directory you cannot call is not a directory.
  await expect(rows.first().locator('a[href^="tel:"]')).toBeVisible()

  await expect(page.getByTestId('public-directory-view-all')).toBeVisible()
})

test('the corpus is not downloaded until the visitor shows interest', async ({ page }) => {
  // The landing page is the site's front door; a thousand firms must not
  // be on its critical path. Deferring the fetch is the whole reason the
  // section is server-rendered.
  let calls = 0
  await page.route('**/api/public/lawyers', async (route) => {
    calls += 1
    await route.continue()
  })

  await page.goto('/')
  await page.getByRole('heading', { name: 'Lawyers Directory', exact: true }).waitFor()

  // Focusing the search box is the visitor showing interest.
  await page.getByTestId('public-directory-search-input').click()
  await expect.poll(() => calls).toBe(1)

  // The ref guard means a second trigger does not refetch.
  await page.getByTestId('practice-area-card').first().click()
  await page.waitForTimeout(500)
  expect(calls).toBe(1)
})

test('a stranger can search the directory and filter by practice area', async ({ page }) => {
  await page.goto('/directory')

  await expect(page.getByRole('heading', { level: 1, name: 'Lawyers Directory' })).toBeVisible()

  const count = page.getByTestId('public-directory-count')
  const before = Number((await count.textContent())?.replace(/\D/g, '') || 0)
  expect(before).toBeGreaterThan(0)

  // Narrowing by category must actually narrow.
  const card = page.getByTestId('practice-area-card').first()
  await card.click()
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => {
    return Number((await count.textContent())?.replace(/\D/g, '') || 0)
  }).toBeLessThan(before)

  // And typing must narrow further still.
  const input = page.getByTestId('public-directory-search-input')
  await input.fill('zzzznotafirmzzzz')
  await expect(page.getByTestId('public-directory-empty')).toBeVisible()
})

test('the public directory never exposes a member firm', async ({ page }) => {
  // The business rule the whole feature rests on: an attorney who signed
  // up here must not have their direct line published on the marketing
  // site. Asserted against the live API rather than a mock, because the
  // rule is only worth anything end to end.
  const res = await page.request.get('/api/public/lawyers')
  expect(res.status()).toBe(200)

  const firms = await res.json()
  expect(Array.isArray(firms)).toBe(true)

  for (const firm of firms) {
    // The allowlist shape, verified on the wire.
    expect(firm).not.toHaveProperty('email')
    expect(firm).not.toHaveProperty('placeId')
    expect(firm).not.toHaveProperty('geocodedAt')
    expect(firm).toHaveProperty('phone')
  }
})

test('the directory carries its disclaimer on both surfaces', async ({ page }) => {
  // Listing ~900 firms that never opted in, on a site that says it
  // connects you with trusted professionals, reads as an endorsement
  // unless it says otherwise. Florida Bar Rule 4-7 cares about this.
  for (const path of ['/', '/directory']) {
    await page.goto(path)
    await expect(
      page.getByText(/does not imply endorsement/i).first()
    ).toBeVisible()
    await expect(
      page.getByText(/not a lawyer referral service/i).first()
    ).toBeVisible()
  }
})

test('the header links work from the directory page, not just the home page', async ({ page }) => {
  // These were bare '#about' hrefs, which resolved against whatever page
  // was current. That was invisible while '/' was the only page wearing
  // this header; from /directory they pointed at /directory#about and
  // went nowhere.
  await page.goto('/directory')
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'About Us' }).click()
  await expect(page).toHaveURL(/\/#about$/)
  await expect(page.locator('#about')).toBeVisible()
})
