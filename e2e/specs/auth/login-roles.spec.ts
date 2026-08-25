import { test, expect } from '@playwright/test'

type Role = 'admin' | 'lawyer' | 'clinic' | 'referrer'

const cases: Array<{ role: Role; loginUrl: string }> = [
  { role: 'admin', loginUrl: '/professionals/login' },
  { role: 'lawyer', loginUrl: '/professionals/login' },
  { role: 'clinic', loginUrl: '/professionals/login' },
  { role: 'referrer', loginUrl: '/professionals/login' },
]

// Serial: avoid Next dev cold-compile racing 4 parallel sign-ins.
test.describe.configure({ mode: 'serial' })

for (const c of cases) {
  test(`logs in as ${c.role} via the UI form`, async ({ page }) => {
    test.setTimeout(90_000)
    const userKey = `E2E_${c.role.toUpperCase()}_USER` as const
    const passKey = `E2E_${c.role.toUpperCase()}_PASS` as const
    const username = process.env[userKey]
    const password = process.env[passKey]
    test.skip(!username || !password, `Missing ${userKey}/${passKey}`)

    await page.goto(c.loginUrl)
    await page.getByLabel('Username').fill(username!)
    await page.getByLabel('Password').fill(password!)

    const [credResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes('/api/auth/callback/credentials') && r.request().method() === 'POST',
        { timeout: 60_000 }
      ),
      page.getByRole('button', { name: /sign in/i }).click(),
    ])
    expect(credResp.status(), `credentials POST should not 4xx for ${c.role}`).toBeLessThan(400)

    // The form then redirects somewhere — destination depends on LoginForm's
    // `getSession()` whose role read can flake on cold dev. We only assert the
    // user eventually leaves the login screen.
    //
    // `waitUntil: 'commit'` is what makes that assertion honest. The default
    // waits for the DESTINATION to finish loading, which for a clinic means
    // `/professionals/map` — Leaflet, the clinic feed, and on a cold `next dev`
    // its first compile. That is how this spec spent 60s failing at something
    // it never meant to test. Leaving the login screen is a URL change, so wait
    // for exactly that.
    await page.waitForURL(
      (url) => !url.pathname.endsWith('/login'),
      { timeout: 60_000, waitUntil: 'commit' }
    )

    // Cookie should be set by now. Poll briefly to absorb any microtask delay.
    await expect
      .poll(
        async () => {
          const cookies = await page.context().cookies()
          return cookies.some((co) =>
            /next-auth\.session-token|__Secure-next-auth\.session-token/.test(co.name)
          )
        },
        { timeout: 5_000 }
      )
      .toBe(true)
  })
}
