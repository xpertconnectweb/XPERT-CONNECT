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

test('the corpus stays off the critical path, and is fetched exactly once', async ({ page }) => {
  /**
   * The landing page is the site's front door; a thousand firms must
   * not be on its critical path. What that rule protects is FIRST
   * PAINT — it never required the corpus to arrive late.
   *
   * It used to be enforced as "no request until the visitor scrolls to
   * the section or touches a control", and the cost showed up in the
   * one path that matters most: going straight for the search box.
   * Until the payload landed the index was empty, so typing a city
   * produced nothing, which reads as a directory that does not contain
   * it. An idle callback now fires after paint as well, so the
   * guarantee asserted here is the real one.
   */
  let calls = 0
  await page.route('**/api/public/lawyers', async (route) => {
    calls += 1
    await route.continue()
  })

  await page.goto('/')
  await page.getByRole('heading', { name: 'Lawyers Directory', exact: true }).waitFor()

  // The section renders from server-supplied rows, with no corpus.
  await expect(page.getByTestId('attorney-row').first()).toBeVisible()
  await expect(page.getByTestId('public-directory-sample-note')).toBeVisible()

  // And the fetch does land on its own, without any interaction.
  await expect.poll(() => calls, { timeout: 10_000 }).toBe(1)
  await expect(page.getByTestId('public-directory-sample-note')).toBeHidden()

  // The ref guard means later triggers do not refetch.
  await page.getByTestId('public-directory-search-input').click()
  await page.getByTestId('practice-area-card').first().click()
  await page.waitForTimeout(500)
  expect(calls).toBe(1)
})

test('a search typed before the corpus lands is never answered with the sample', async ({
  page,
}) => {
  /**
   * The failure the client reported, reproduced: "I search Bradenton
   * and nothing comes up."
   *
   * The rows underneath are a deliberate sample — one firm per practice
   * area, then one per city. Rendering them while a query is pending
   * presented nine firms from other cities as the answer to that query,
   * under a counter reading "627 of 627". There was nothing on screen
   * to suggest the search had not run yet.
   */
  await page.route('**/api/public/lawyers', async (route) => {
    await new Promise((r) => setTimeout(r, 2500))
    await route.continue()
  })

  await page.goto('/directory')
  const input = page.getByTestId('public-directory-search-input')
  await input.fill('Bradenton')

  // Mid-flight: placeholders, no sample rows, and a count that declines
  // to claim a number it does not have.
  await expect(page.getByTestId('public-directory-skeleton')).toBeVisible()
  await expect(page.getByTestId('attorney-row')).toHaveCount(0)
  const count = page.getByTestId('public-directory-count')
  await expect(count).toHaveAttribute('data-state', 'loading')
  await expect(count).not.toHaveText(/\d/)

  // Then the real answer.
  await expect(page.getByTestId('public-directory-skeleton')).toBeHidden({ timeout: 15_000 })
  await expect(count).toHaveAttribute('data-state', 'results')
  await expect(page.getByTestId('attorney-row').first()).toBeVisible()
})

test('a stranger can search the directory and filter by practice area', async ({ page }) => {
  await page.goto('/directory')

  await expect(page.getByRole('heading', { level: 1, name: 'Lawyers Directory' })).toBeVisible()

  const count = page.getByTestId('public-directory-count')

  /**
   * Wait for the corpus before reading the baseline.
   *
   * This used to read it immediately, and it worked by accident: the
   * count rendered the whole-corpus total while the list below it was
   * still nine server-rendered sample rows, so the number described a
   * result set that did not exist yet. Now it reports the sample until
   * the search can actually run, so the baseline has to be taken once
   * there is something to be a baseline OF.
   */
  await expect(count).toHaveAttribute('data-state', 'results')
  const before = Number((await count.textContent())?.replace(/\D/g, '') || 0)
  expect(before).toBeGreaterThan(100)

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

test('the public feed ships the allowlisted fields and nothing else', async ({ page }) => {
  /**
   * This was called "the public directory never exposes a member firm",
   * and it never checked that — the body has only ever asserted the
   * shape of the payload. The membership gate it was named after has
   * since been removed deliberately (see getPublicDirectoryLawyers), so
   * the name now matches what the test does.
   *
   * What it checks is still the thing that matters most on an
   * unauthenticated route: `email` and the geocoding bookkeeping must
   * not travel, and a listing must carry a number you can call.
   * Asserted against the live API rather than a mock, because an
   * allowlist is only worth anything on the wire.
   */
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
