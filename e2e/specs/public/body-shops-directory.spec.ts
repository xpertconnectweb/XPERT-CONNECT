import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/**
 * The public Body Shops Directory, the way a stranger meets it: no account,
 * no storage state. Its data is a file shipped with the build
 * (src/data/body-shops.json), so unlike the lawyers specs nothing here
 * depends on the database.
 *
 * Counts are never hard-coded. They are read from the public feed, so a
 * refresh of the data does not break the suite.
 */

interface Listing {
  id: string
  name: string
  kind: string
  city: string
  county: string
  state: 'FL' | 'MN'
  zipCode: string
}

async function feed(request: APIRequestContext): Promise<Listing[]> {
  const res = await request.get('/api/public/body-shops')
  expect(res.ok()).toBe(true)
  return res.json()
}

const count = (page: Page) => page.getByTestId('body-shop-count')

/** On /body-shops the corpus loads on mount; wait until the count describes it. */
async function openFullPage(page: Page, path = '/body-shops') {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1, name: 'Body Shops Directory' })).toBeVisible()
  await expect(count(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 })
}

test('the landing page shows a populated Body Shops Directory under the lawyers one', async ({
  page,
}) => {
  const res = await page.goto('/')
  expect(res?.status()).toBe(200)

  const lawyers = page.getByRole('heading', { name: 'Lawyers Directory', exact: true })
  const shops = page.getByRole('heading', { name: 'Body Shops Directory', exact: true })
  await expect(lawyers).toBeVisible()
  await expect(shops).toBeVisible()
  // Its own block, after the lawyers one.
  const [lawyersY, shopsY] = await Promise.all([
    lawyers.evaluate((el) => el.getBoundingClientRect().top + window.scrollY),
    shops.evaluate((el) => el.getBoundingClientRect().top + window.scrollY),
  ])
  expect(shopsY).toBeGreaterThan(lawyersY)

  const section = page.locator('#body-shops')
  const cards = section.getByTestId('practice-area-card')
  expect(await cards.count()).toBeGreaterThanOrEqual(4)
  await expect(cards.first()).toContainText('Independent')
  await expect(cards.first()).toContainText(/\d+ shops?/)

  // Nine rows at rest, each with the form and no phone.
  const rows = section.getByTestId('body-shop-row')
  await expect(rows).toHaveCount(9)
  await expect(rows.first().getByTestId('firm-request-info')).toBeVisible()
  await expect(section.locator('a[href^="tel:"]')).toHaveCount(0)
  await expect(section.getByTestId('body-shop-view-all')).toHaveText(/View all [\d,]+ body shops/)
})

test('the landing block keeps its sample after the corpus lands, and fetches it once', async ({
  page,
}) => {
  let calls = 0
  await page.route('**/api/public/body-shops', async (route) => {
    calls += 1
    await route.continue()
  })

  await page.goto('/')
  const section = page.locator('#body-shops')
  await expect(section.getByTestId('body-shop-sample-note')).toBeVisible()

  // The idle callback fetches it without any interaction…
  await expect.poll(() => calls, { timeout: 10_000 }).toBe(1)
  // …and with no search, the deliberate sample stays rather than becoming
  // "all shops in ZIP order".
  await page.waitForTimeout(500)
  await expect(section.getByTestId('body-shop-sample-note')).toBeVisible()
  await expect(section.getByTestId('body-shop-row')).toHaveCount(9)

  // A search answers from the whole corpus, and no trigger refetches.
  await section.getByTestId('body-shop-search-input').fill('Minneapolis')
  await expect(count(page)).toHaveAttribute('data-state', 'results')
  await expect(section.getByTestId('body-shop-row').first()).toContainText('Minneapolis, MN')
  await section.getByTestId('practice-area-card').first().click()
  await page.waitForTimeout(300)
  expect(calls).toBe(1)
})

test('the public feed ships name and place only, from both states', async ({ request }) => {
  const res = await request.get('/api/public/body-shops')
  const text = await res.text()
  const shops = JSON.parse(text) as Record<string, unknown>[]

  expect(shops.length).toBeGreaterThan(1000)
  for (const shop of shops) {
    expect(Object.keys(shop).sort()).toEqual(
      ['city', 'county', 'id', 'kind', 'name', 'state', 'zipCode'].sort()
    )
  }
  expect(new Set(shops.map((s) => s.state))).toEqual(new Set(['FL', 'MN']))
  // No phone number anywhere in the payload, in any field.
  expect(text).not.toMatch(/\(\d{3}\) \d{3}-\d{4}/)
  expect(text).not.toMatch(/https?:\/\//)
})

test('a visitor narrows by state, county, kind and text, and the URL follows', async ({
  page,
  request,
}) => {
  const all = await feed(request)
  const mn = all.filter((s) => s.state === 'MN')
  const hennepin = mn.filter((s) => s.county === 'Hennepin')

  await openFullPage(page)
  await expect(count(page)).toHaveText(all.length.toLocaleString('en-US'))

  await page.getByRole('radio', { name: /^Minnesota/ }).click()
  await expect(count(page)).toHaveText(mn.length.toLocaleString('en-US'))
  await expect(page).toHaveURL(/state=MN/)

  await page.getByTestId('body-shop-county').selectOption({ label: 'Hennepin County' })
  await expect(count(page)).toHaveText(String(hennepin.length))
  await expect(page).toHaveURL(/county=Hennepin/)
  const rows = page.getByTestId('body-shop-row')
  const shown = await rows.count()
  expect(shown).toBeGreaterThan(0)
  for (let i = 0; i < Math.min(shown, 10); i++) {
    await expect(rows.nth(i)).toContainText(', MN')
    await expect(rows.nth(i)).toContainText('Hennepin County')
  }

  // A kind card counts what is in scope, and filters to it.
  const independents = hennepin.filter((s) => s.kind === 'Independent').length
  const card = page.getByTestId('practice-area-card').filter({ hasText: 'Independent' })
  await expect(card).toContainText(`${independents} shop`)
  await card.click()
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await expect(count(page)).toHaveText(String(independents))

  // Text search inside the filters.
  await page.getByTestId('practice-area-card').filter({ hasText: 'Independent' }).click()
  await page.getByTestId('body-shop-search-input').fill('caliber')
  await expect(page).toHaveURL(/q=caliber/)
  const caliberRows = page.getByTestId('body-shop-row')
  await expect(caliberRows.first()).toContainText(/caliber/i)

  // Clearing everything returns the whole directory.
  await page.getByRole('button', { name: 'Clear filters' }).first().click()
  await expect(count(page)).toHaveText(all.length.toLocaleString('en-US'))
})

test('a shared link opens on the search it describes', async ({ page, request }) => {
  const all = await feed(request)
  const flMaaco = all.filter((s) => s.state === 'FL' && s.kind === 'Maaco')
  expect(flMaaco.length).toBeGreaterThan(0)

  await openFullPage(page, '/body-shops?state=FL&area=Maaco')
  await expect(count(page)).toHaveText(String(flMaaco.length))
  await expect(page.getByRole('radio', { name: /^Florida/ })).toHaveAttribute('aria-checked', 'true')
  await expect(
    page.getByTestId('practice-area-card').filter({ hasText: 'Maaco' })
  ).toHaveAttribute('aria-pressed', 'true')
})

test('"Get information" asks for name, phone and email, then shows the shop contact', async ({
  page,
}) => {
  let posted: Record<string, string> | null = null
  let postedUrl = ''
  await page.route('**/api/public/body-shops/*/inquiry', async (route) => {
    posted = route.request().postDataJSON()
    postedUrl = route.request().url()
    await route.fulfill({
      json: {
        ok: true,
        contact: {
          id: 'stub',
          name: 'Stub Body Shop',
          phone: '(612) 555-0142',
          website: 'https://stub.example',
          address: '1 Main St, Minneapolis, MN 55401',
        },
      },
    })
  })

  await openFullPage(page)
  const row = page.getByTestId('body-shop-row').first()
  const name = (await row.locator('p').first().textContent())?.trim() ?? ''
  await row.getByTestId('firm-request-info').click()

  const modal = page.getByTestId('info-request-modal')
  await expect(modal).toBeVisible()
  await expect(modal).toContainText(name)
  await expect(modal).toContainText('this shop’s contact information')
  await modal.getByLabel(/name/i).fill('E2E Visitor')
  await modal.getByLabel(/phone/i).fill('(305) 555-0199')
  await modal.getByLabel(/email/i).fill('visitor@e2e.test')
  await modal.getByTestId('info-request-submit').click()

  const contact = page.getByTestId('info-request-contact')
  await expect(contact).toBeVisible()
  await expect(contact.locator('a[href^="tel:"]')).toContainText('(612) 555-0142')
  await expect(contact.getByRole('link', { name: /visit website/i })).toBeVisible()
  expect(postedUrl).toMatch(/\/api\/public\/body-shops\/[^/]+\/inquiry$/)
  expect(posted).toMatchObject({ name: 'E2E Visitor', phone: '(305) 555-0199', email: 'visitor@e2e.test' })
})

test('the directory carries its disclaimer on both surfaces', async ({ page }) => {
  for (const path of ['/', '/body-shops']) {
    await page.goto(path)
    // The removal link is the body shops' own, not the lawyers' one.
    const removal = page.locator('a[href*="Body%20Shops%20Directory%20listing%20correction"]')
    await expect(removal).toHaveCount(1)
    await expect(removal).toHaveText('Report an error or request removal')
    await expect(
      page.getByText(/any relationship between the shop and Xpert Connect/)
    ).toBeVisible()
  }
})

test('the header reaches the directory, on desktop and from the menu', async ({ page }) => {
  // Desktop: the full nav.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Body Shops' }).click()
  await expect(page).toHaveURL(/\/body-shops$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Body Shops Directory' })).toBeVisible()

  // Below 1280px the nav folds into the menu, which must carry the link.
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.goto('/directory')
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden()
  await page.getByRole('button', { name: 'Toggle menu' }).click()
  await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Body Shops' }).click()
  await expect(page).toHaveURL(/\/body-shops$/)
})

test('the header is solid at the top of a directory page, not white on white', async ({ page }) => {
  for (const path of ['/body-shops', '/directory']) {
    await page.goto(path)
    const bg = await page.locator('header').evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg, path).toBe('rgb(255, 255, 255)')
  }
  // The home page keeps its transparent header over the dark hero.
  await page.goto('/')
  const home = await page.locator('header').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(home).toBe('rgba(0, 0, 0, 0)')
})
