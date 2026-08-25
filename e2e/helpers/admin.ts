import { expect, type Page } from '@playwright/test'

/**
 * Wait for a row to appear in an admin table after a write.
 *
 * Saving from an admin modal does `setLoading(true)` and refetches, which swaps
 * the entire table for a spinner — so between the click and the assertion there
 * are no rows at all. On a cold `next dev` that refetch also waits for
 * `/api/admin/clinics` to compile (7.3s observed) before re-rendering ~700
 * rows, and the 15s these assertions used to carry ran out right there. That is
 * why the two specs using it failed on `main` at `--workers=1`.
 *
 * Verified against a warm server that the app itself is fine: the record is
 * created, the header counter goes 697 → 698, and the row is in the DOM and
 * matches this exact locator. The budget was the only thing wrong.
 *
 * Pair with `test.slow()`, or two calls in one test will exhaust the 60s
 * per-test timeout before either can time out on its own.
 */
export async function expectAdminRow(page: Page, text: string): Promise<void> {
  await expect(page.getByRole('row').filter({ hasText: text })).toBeVisible({
    timeout: 30_000,
  })
}
