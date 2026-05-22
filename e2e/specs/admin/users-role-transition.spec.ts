import { test, expect } from '../../fixtures/factories'
import { createServiceClient } from '../../helpers/supabase-admin'

/**
 * Role-transition stale-link clearing.
 *
 * Memory: when a user's role changes (e.g. lawyer → clinic), the link to the
 * previous role's entity (lawyer_id) must be cleared so the user doesn't carry
 * stale firm membership into a new role.
 */
test('changing a user role from lawyer to clinic clears lawyer_id', async ({
  page,
  createLawyer,
  createClinic,
  createUser,
  ns,
}) => {
  const firm = await createLawyer({ name: `${ns}firm` })
  const clinic = await createClinic({ name: `${ns}clinic` })
  // Username is validated against USERNAME_RE (^[a-zA-Z0-9_]{3,30}$) on the
  // Edit User form save. The default factory uses `${ns}user-XXXX`, which
  // both exceeds 30 chars and contains hyphens (disallowed). Override with
  // a short underscore-only value so the role-transition save passes.
  const shortUsername = `e2e_utr_${Math.random().toString(36).slice(2, 8)}`
  const user = await createUser({
    username: shortUsername,
    role: 'lawyer',
    lawyer_id: firm.id,
    clinic_id: null,
    email: `${ns}user@e2e.test`,
  })

  await page.goto('/admin/users')
  // /admin/users has no top-level search input — the modal's "Search firm..."
  // / "Search clinic..." inputs only render once the edit modal is open.
  // The Edit button aria-label is "Edit <name>" (not <username>).
  await page
    .getByRole('button', { name: new RegExp(`edit ${user.name}`, 'i') })
    .click()

  // Scope to the Edit User modal — `getByLabel(/role/i)` also matches the
  // table's "Edit <username>"/"Delete <username>" buttons whenever the test's
  // namespace contains the substring "role" (e.g. ns includes the test name).
  // The labels on this form don't use htmlFor, so target the modal's first
  // <select> (which is Role) directly.
  const modal = page.locator('div.fixed.inset-0').filter({
    has: page.getByRole('heading', { name: /edit user/i }),
  })
  await modal.locator('select').first().selectOption('clinic')

  // The "Linked Clinic" picker is a search input + button list (no <select>).
  await modal.getByPlaceholder('Search clinic by name or address').fill(clinic.name as string)
  await modal.getByRole('button', { name: clinic.name as string }).first().click()

  await modal.getByRole('button', { name: /^save$|update/i }).click()

  // After save, modal closes; the row's role badge updates from "Attorney"
  // to "Clinic". Filter to our user's row to avoid the bulk "Clinic" badges
  // already in the table.
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: user.username as string })
      .getByText('Clinic', { exact: true }),
  ).toBeVisible({ timeout: 15_000 })

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('id, role, lawyer_id, clinic_id')
    .eq('id', user.id)
    .single()
  expect(data?.role).toBe('clinic')
  expect(data?.lawyer_id).toBeNull()
  expect(data?.clinic_id).toBe(clinic.id)
})
