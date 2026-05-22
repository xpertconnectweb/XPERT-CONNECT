import type { Page, Locator } from '@playwright/test'

export const sel = {
  nav: (page: Page, label: string | RegExp): Locator =>
    page.getByRole('link', { name: label }),
  primaryButton: (page: Page, label: string | RegExp): Locator =>
    page.getByRole('button', { name: label }),
  field: (page: Page, label: string | RegExp): Locator =>
    page.getByLabel(label),
  row: (page: Page, text: string | RegExp): Locator =>
    page.getByRole('row', { name: text }),
  toast: (page: Page): Locator =>
    page.locator('[role="status"], [data-toast], .toast').first(),
}

export async function expectToast(page: Page, text: string | RegExp) {
  const t = sel.toast(page)
  await t.waitFor({ state: 'visible', timeout: 10_000 })
  const content = await t.innerText()
  if (typeof text === 'string') {
    if (!content.toLowerCase().includes(text.toLowerCase())) {
      throw new Error(`Toast did not contain "${text}", got: ${content}`)
    }
  } else if (!text.test(content)) {
    throw new Error(`Toast did not match ${text}, got: ${content}`)
  }
}
