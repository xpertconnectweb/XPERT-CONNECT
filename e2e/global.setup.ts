import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { createServiceClient } from './helpers/supabase-admin'
import { basePrefix, rand } from './helpers/namespace'

/**
 * `referrer_referrals.referrer_id` is a FK to `users(id)`, and
 * `/api/partners/referrals` only returns rows matching the logged-in partner.
 * So a spec that wants a visible partner referral needs the id, not the
 * username — resolved here for both the provisioned and the real-credentials
 * paths, and read by the `createReferrerReferral` fixture.
 */
async function resolvePartnerId(): Promise<void> {
  const username = process.env.E2E_PARTNER_USER
  if (!username) return
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single()
    if (error) throw new Error(error.message)
    process.env.E2E_PARTNER_USER_ID = data.id as string
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.warn(`[e2e setup] could not resolve the partner user id: ${message}`)
  }
}

/**
 * The partner project used to be unrunnable.
 *
 * `E2E_PARTNER_USER` / `E2E_PARTNER_PASS` ship empty, `auth.setup.ts` gates
 * partner auth on them, so `.auth/partner.json` was never written and
 * `--project=chromium-partner` died reading it. The result was a whole role
 * with no coverage at all, which is the sort of gap that stays open for months
 * because nothing fails loudly.
 *
 * Rather than ask for a real password, provision a throwaway partner the same
 * way the fixtures provision every other row: namespaced username, deleted by
 * `global.teardown.ts` on the way out. Real credentials, when present, always
 * win — this only fills a hole.
 */
async function provisionPartner(): Promise<void> {
  if (process.env.E2E_PARTNER_USER && process.env.E2E_PARTNER_PASS) return

  const username = `${basePrefix()}partner-${rand(5)}`
  const password = `e2e-${rand(12)}`

  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('users').insert({
      id: `${basePrefix()}u-partner-${rand(5)}`,
      username,
      // The column is `password` and holds the bcrypt hash directly — see
      // USER_COLUMNS in src/lib/data.ts.
      password: await bcrypt.hash(password, 10),
      role: 'partner',
      email: `${username}@e2e.test`,
      name: 'E2E Partner',
      state: 'FL',
    })
    if (error) throw new Error(error.message)

    // Workers are forked after globalSetup, so they inherit these. This is what
    // makes both auth.setup.ts and the specs' own skip guards see a partner.
    process.env.E2E_PARTNER_USER = username
    process.env.E2E_PARTNER_PASS = password
    console.log(`[e2e setup] provisioned throwaway partner "${username}"`)
  } catch (e: unknown) {
    // Never fail the whole run over this: every other role still works, and the
    // partner specs skip themselves when the credentials are absent.
    const message = e instanceof Error ? e.message : String(e)
    console.warn(`[e2e setup] could not provision a partner user: ${message}`)
  }
}

async function globalSetup() {
  const authDir = path.resolve(process.cwd(), '.auth')
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  if (!process.env.E2E_NAMESPACE_PREFIX) {
    process.env.E2E_NAMESPACE_PREFIX = `e2e-${Date.now()}-`
  }

  const required = [
    'E2E_ADMIN_USER',
    'E2E_ADMIN_PASS',
    'E2E_LAWYER_USER',
    'E2E_LAWYER_PASS',
    'E2E_CLINIC_USER',
    'E2E_CLINIC_PASS',
    'E2E_REFERRER_USER',
    'E2E_REFERRER_PASS',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]
  const missing = required.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(
      `E2E missing env vars: ${missing.join(', ')}. Copy .env.test.example → .env.test and fill in.`,
    )
  }

  await provisionPartner()
  await resolvePartnerId()
}

export default globalSetup
