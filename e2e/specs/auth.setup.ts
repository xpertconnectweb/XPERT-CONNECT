import { test as setup, expect, type BrowserContext } from '@playwright/test'
import path from 'node:path'

type RoleSpec = {
  role: 'admin' | 'lawyer' | 'clinic' | 'referrer' | 'partner' | 'directory'
  username: string
  password: string
}

function spec(role: RoleSpec['role']): RoleSpec {
  const userKey = `E2E_${role.toUpperCase()}_USER`
  const passKey = `E2E_${role.toUpperCase()}_PASS`
  return {
    role,
    username: process.env[userKey] ?? '',
    password: process.env[passKey] ?? '',
  }
}

/**
 * Programmatic NextAuth login. We bypass the LoginForm UI to avoid the race
 * between `signIn({ redirect: false })` setting the cookie and the following
 * `router.push()` hitting a server-rendered page before the cookie propagates.
 *
 * The two-step dance mirrors what NextAuth's credentials provider expects:
 *   1. GET  /api/auth/csrf → returns { csrfToken } + sets the csrf cookie
 *   2. POST /api/auth/callback/credentials with form-encoded creds + csrfToken
 *      → on success, sets the `next-auth.session-token` cookie
 */
async function loginViaApi(context: BrowserContext, s: RoleSpec) {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  const csrfRes = await context.request.get(`${baseURL}/api/auth/csrf`)
  expect(csrfRes.ok(), 'csrf endpoint should be 200').toBe(true)
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }

  const loginRes = await context.request.post(
    `${baseURL}/api/auth/callback/credentials`,
    {
      form: {
        csrfToken,
        username: s.username,
        password: s.password,
        callbackUrl: baseURL,
        json: 'true',
      },
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }
  )

  // NextAuth returns 200 on credential success (with `redirect: false` semantics
  // since we pass json:true) — body { url } points at the callback target.
  expect(
    loginRes.status(),
    `credentials callback should not 4xx for ${s.role}: ${loginRes.status()} ${await loginRes.text().catch(() => '')}`
  ).toBeLessThan(400)

  const cookies = await context.cookies()
  const session = cookies.find((c) =>
    /next-auth\.session-token|__Secure-next-auth\.session-token/.test(c.name)
  )
  if (!session) {
    throw new Error(
      `No next-auth session-token cookie set for ${s.role} after login`
    )
  }
}

// Sequential — pay first cold compile once.
setup.describe.configure({ mode: 'serial' })

const roles: RoleSpec['role'][] = ['admin', 'lawyer', 'clinic', 'referrer']
if (process.env.E2E_PARTNER_USER && process.env.E2E_PARTNER_PASS) {
  roles.push('partner')
}
// Gated the same way as partner, so CI without these secrets still passes.
if (process.env.E2E_DIRECTORY_USER && process.env.E2E_DIRECTORY_PASS) {
  roles.push('directory')
}

for (const role of roles) {
  setup(`authenticate as ${role}`, async ({ context }) => {
    setup.setTimeout(120_000)
    const s = spec(role)
    if (!s.username || !s.password) {
      setup.skip(true, `Missing credentials for ${role}; skipping`)
    }
    await loginViaApi(context, s)
    const file = path.resolve(process.cwd(), `.auth/${role}.json`)
    await context.storageState({ path: file })
  })
}
