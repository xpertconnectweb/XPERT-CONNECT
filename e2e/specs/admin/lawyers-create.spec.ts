import { test, expect } from '../../fixtures/factories'
import { openManualCoordinates } from '../../helpers/admin'
import { createServiceClient } from '../../helpers/supabase-admin'

test('admin can create a lawyer firm and it appears in the lawyers list', async ({
  page,
  ns,
}) => {
  const firm = `${ns}firm-${Date.now()}`

  await page.goto('/admin/lawyers')
  await page.getByRole('button', { name: /new lawyer|add lawyer|new firm/i }).click()

  // Use unique placeholder substrings tied to the lawyer modal — `/address/i`
  // (alone or in alternation) also matches the page's "Search by name,
  // address, practice area..." filter, and the email/phone/practice-areas
  // alternations were equally fragile.
  await page.getByPlaceholder('Law Firm Name').fill(firm)
  await page.getByTestId('lawyer-address-input').fill('1 E2E Law Ave, Miami, FL 33101')

  // See clinics-create-edit: coordinates moved behind "Set coordinates
  // manually". This spec drives that escape hatch rather than the suggestion
  // path, so an admin test never depends on a geocoding provider.
  await openManualCoordinates(page)
  await page.getByPlaceholder('25.7617').fill('25.7617')
  await page.getByPlaceholder('-80.1918').fill('-80.1918')
  await page.getByPlaceholder('+1 (305) 555-0123').fill('305-555-0200')
  await page.getByPlaceholder('info@lawfirm.com').fill(`${ns}firm@e2e.test`)

  // Practice areas are chip toggles sourced from the managed catalog,
  // not a comma-separated input. The testid is the stable handle.
  await page
    .getByTestId('practice-areas-select')
    .getByRole('button', { name: 'Personal Injury', exact: true })
    .click()

  await page.getByRole('button', { name: /^save$|create|submit/i }).click()

  // Match the row — the firm name appears in cell + Edit/Delete action button
  // accessible names, which makes a plain cell match strict-mode-violating.
  await expect(
    page.getByRole('row').filter({ hasText: firm }),
  ).toBeVisible({ timeout: 15_000 })

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('lawyers')
    .select('id, name')
    .eq('name', firm)
    .single()
  expect(data?.name).toBe(firm)
  if (data?.id) {
    await supabase.from('lawyers').delete().eq('id', data.id)
  }
})
