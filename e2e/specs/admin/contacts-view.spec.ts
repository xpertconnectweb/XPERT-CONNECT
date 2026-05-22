import { test, expect } from '../../fixtures/factories'

/**
 * Cross-context flow: public visitor submits landing contact, admin sees it.
 * We use the factory's createContact to inject the row directly (faster + isolated),
 * then verify the admin page renders it.
 */
test('admin sees a contact submission in /admin/contacts', async ({
  page,
  createContact,
  ns,
}) => {
  const contact = await createContact({
    name: `${ns}sender`,
    email: `${ns}sender@e2e.test`,
    message: 'Need help with my case',
  })

  await page.goto('/admin/contacts')
  // No search bar exists on /admin/contacts — the ns-namespaced row uniquely
  // identifies our contact without filtering.
  await expect(
    page.getByRole('row').filter({ hasText: contact.name as string }),
  ).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(contact.email as string)).toBeVisible()
})

// /admin/contacts has no "mark as read" / status workflow today — only View
// (Eye) and Delete buttons per src/app/admin/(dashboard)/contacts/page.tsx.
// Unskip once a read/resolved status column exists.
test.skip('admin can mark a contact as read', async ({ page, createContact, ns }) => {
  const contact = await createContact({ name: `${ns}readme` })

  await page.goto('/admin/contacts')

  const row = page.getByRole('row', { name: new RegExp(contact.name as string) })
  await row.getByRole('button', { name: /mark as read|read|status/i }).click()

  await expect(row.getByText(/read|resolved/i)).toBeVisible({ timeout: 10_000 })
})
