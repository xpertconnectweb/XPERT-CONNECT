/**
 * Standalone teardown — sweeps any e2e-* records left behind by failed CI runs
 * or aborted local runs. Invoked via `npm run e2e:sweep`.
 *
 * Uses E2E_NAMESPACE_PREFIX if set, else broad `e2e-%` match.
 */
import { config } from 'dotenv'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

config({ path: path.resolve(process.cwd(), '.env.test') })

async function main() {
  const prefix = process.env.E2E_NAMESPACE_PREFIX ?? 'e2e-'
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const tables: Array<{ table: string; col: string }> = [
    { table: 'referrals', col: 'patient_name' },
    { table: 'contacts', col: 'name' },
    { table: 'newsletter_subscribers', col: 'email' },
    { table: 'users', col: 'username' },
    { table: 'lawyers', col: 'name' },
    { table: 'clinics', col: 'name' },
    { table: 'activity_logs', col: 'target_name' },
  ]

  console.log(`Sweeping records matching prefix "${prefix}"...`)
  for (const { table, col } of tables) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .like(col, `${prefix}%`)
    if (error) {
      console.warn(`  ${table}: ERROR ${error.message}`)
    } else {
      console.log(`  ${table}: deleted ${count ?? 0}`)
    }
  }

  // The SMS tables are keyed by phone number, not by a namespaced
  // text column, so the prefix sweep above cannot reach them.
  //
  // Scoped HARD to Twilio's magic test numbers. `sms_opt_outs` in
  // particular must never be swept by anything broader: those rows
  // are the proof that a real person's STOP was honoured, and
  // deleting one would silently resume texting somebody who asked us
  // to stop. `phone_verifications` mostly cleans itself, since it
  // cascades when the e2e user row above is deleted.
  const TEST_NUMBERS = ['+15005550006', '+15005550001', '+15005550009']
  for (const table of ['sms_messages', 'phone_verifications', 'sms_opt_outs']) {
    const col = table === 'sms_messages' ? 'to_e164' : 'phone_e164'
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .in(col, TEST_NUMBERS)
    if (error) {
      console.warn(`  ${table}: ERROR ${error.message}`)
    } else {
      console.log(`  ${table}: deleted ${count ?? 0} (test numbers only)`)
    }
  }

  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
