import { test, expect } from '@playwright/test'

test('shows error and stays on login when credentials are wrong', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/professionals/login')
  await page.getByLabel('Username').fill('nonexistent_user_e2e')
  await page.getByLabel('Password').fill('totally-wrong-password')
  await page.getByRole('button', { name: /sign in/i }).click()

  // The login error renders as a role=alert div with text "Invalid username or
  // password". Next.js also injects an empty #__next-route-announcer__ with
  // role=alert, so match by text rather than role.
  // Cold-compile of /api/auth/[...nextauth] can take 15s+ on first hit, plus
  // the credentials POST itself. Give the alert a generous window.
  await expect(
    page.getByText(/invalid username or password/i)
  ).toBeVisible({ timeout: 60_000 })
  await expect(page).toHaveURL(/\/professionals\/login/)

  const cookies = await page.context().cookies()
  const sessionCookie = cookies.find((c) =>
    /next-auth.*session-token/.test(c.name),
  )
  expect(sessionCookie).toBeUndefined()
})

test('clears the password field after a failed attempt', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/professionals/login')
  await page.getByLabel('Username').fill('nonexistent_user_e2e')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: /sign in/i }).click()
  // Cold-compile of /api/auth/[...nextauth] can take 15s+ on first hit, plus
  // the credentials POST itself. Give the alert a generous window.
  await expect(
    page.getByText(/invalid username or password/i)
  ).toBeVisible({ timeout: 60_000 })
  await expect(page.getByLabel('Password')).toHaveValue('')
})
