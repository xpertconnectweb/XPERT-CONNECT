import { test, expect } from '@playwright/test'

const rows = (p: import('@playwright/test').Page) => p.getByTestId('attorney-row')

test('the featured firm leads the list at rest', async ({ page }) => {
  await page.goto('/directory')
  await expect(page.getByTestId('public-directory-count')).toHaveAttribute(
    'data-state',
    'results'
  )
  await expect(rows(page).first()).toContainText('CZAIA LAW')
  await expect(rows(page).first().getByTestId('firm-featured-badge')).toBeVisible()

})

test('the featured firm leads Personal Injury', async ({ page }) => {
  await page.goto('/directory?area=Personal%20Injury')
  await expect(page.getByTestId('public-directory-count')).toHaveAttribute(
    'data-state',
    'results'
  )
  await expect(rows(page).first()).toContainText('CZAIA LAW')
  await expect(rows(page).first()).toContainText('Personal Injury')
})

test('the featured firm findable by name and by city', async ({ page }) => {
  await page.goto('/directory')
  const count = page.getByTestId('public-directory-count')
  await expect(count).toHaveAttribute('data-state', 'results')
  const input = page.getByTestId('public-directory-search-input')

  await input.fill('Czaia')
  await expect(rows(page).first()).toContainText('CZAIA LAW')

  await input.fill('czaia law')
  await expect(rows(page).first()).toContainText('CZAIA LAW')

  // And it joins the Bradenton set rather than displacing it.
  await input.fill('Bradenton')
  await expect(rows(page).first()).toContainText('CZAIA LAW')
  // It JOINS the Bradenton set rather than being pinned on top of it:
  // the count includes it, which only happens when it genuinely matched.
  await expect.poll(async () => Number((await count.textContent())?.replace(/D/g, '') || 0))
    .toBeGreaterThanOrEqual(12)
})

test('the featured firm pinned even where it does not belong, and labelled', async ({ page }) => {
  await page.goto('/directory?q=Miami')
  const count = page.getByTestId('public-directory-count')
  await expect(count).toHaveAttribute('data-state', 'results')

  // First row regardless of the query — the brief was "no matter what".
  await expect(rows(page).first()).toContainText('CZAIA LAW')
  await expect(rows(page).first().getByTestId('firm-featured-badge')).toBeVisible()

  // But the count still describes the search, not the pin.
  const shown = Number((await count.textContent())?.replace(/\D/g, '') || 0)
  expect(shown).toBeGreaterThan(1)
  await expect(rows(page).nth(1)).toContainText('Miami')
})

test('the featured firm on the landing block too', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('heading', { name: 'Lawyers Directory', exact: true }).scrollIntoViewIfNeeded()
  await expect(rows(page).first()).toContainText('CZAIA LAW')
})
