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

/**
 * Reveals the manual latitude/longitude fields in the clinic and lawyer forms.
 *
 * They moved behind a `<details>` when the address field gained autocomplete.
 * They are deliberately still reachable — a clinic in a new development that no
 * provider knows yet has to be creatable — so three admin specs need to open it.
 *
 * Closing the suggestion list first is the load-bearing part. The address field
 * is a combobox, so typing into it opens a listbox that renders directly over
 * the disclosure beneath — Playwright reported a suggestion row
 * "intercepts pointer events" and the click never landed. That is the combobox
 * behaving correctly, and a real user dismisses it the same way.
 *
 * Escape is pressed ONLY when the list is actually expanded. `SmartSearchBox`
 * treats Escape in two stages — first press closes the list, second clears the
 * input — so pressing it blind would wipe the address the caller just typed.
 *
 * The scroll is then a separate step from the click, so the summary is
 * stationary when Playwright's actionability check runs. Deliberately not
 * `force: true`: that would also skip the interception check, which is the one
 * that found this in the first place.
 */
export async function openManualCoordinates(page: import('@playwright/test').Page) {
  // `input[role="combobox"]`, not `getByRole('combobox')`. A bare `<select>`
  // carries that role implicitly, and these admin pages have four of them for
  // the table filters — the role query resolved to five elements and failed
  // strict mode. Only the address field is an input with the role, and each
  // form has exactly one.
  const combobox = page.locator('input[role="combobox"]')
  const listbox = page.locator('ul[role="listbox"]')

  // Wait for the list to actually appear before dismissing it, rather than
  // reading `aria-expanded` once. That attribute is rendered by React, so a
  // check taken straight after `.fill()` can read the pre-update value — which
  // is exactly what happened: Chromium won the race and skipped the dismissal
  // harmlessly, Firefox lost it and then spent thirty seconds trying to click
  // a summary the suggestions were sitting on top of.
  //
  // The wait is allowed to time out. A caller that has not typed an address
  // has no list to close, and that is fine.
  await listbox.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
  if (await listbox.isVisible()) {
    await combobox.press('Escape')
    await listbox.waitFor({ state: 'hidden' })
  }

  const summary = page.getByText('Set coordinates manually')
  await summary.scrollIntoViewIfNeeded()
  await summary.click()
}
