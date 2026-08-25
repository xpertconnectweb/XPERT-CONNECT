import { createServiceClient } from './helpers/supabase-admin'

const PREFIX_ENV = 'E2E_NAMESPACE_PREFIX'

async function globalTeardown() {
  const prefix = process.env[PREFIX_ENV] ?? 'e2e-'
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return
  }
  const supabase = createServiceClient()

  const tables: Array<{ table: string; col: string }> = [
    { table: 'referrals', col: 'patient_name' },
    // Before `users`: referrer_id is a FK to users(id), so a leftover row here
    // would block deleting the throwaway partner that global.setup provisions.
    { table: 'referrer_referrals', col: 'client_name' },
    { table: 'contacts', col: 'name' },
    { table: 'newsletter_subscribers', col: 'email' },
    { table: 'users', col: 'username' },
    { table: 'lawyers', col: 'name' },
    { table: 'clinics', col: 'name' },
    { table: 'activity_logs', col: 'target_name' },
  ]

  for (const { table, col } of tables) {
    try {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: 'exact' })
        .like(col, `${prefix}%`)
      if (error) {
        console.warn(`[e2e teardown] ${table}: ${error.message}`)
      } else {
        console.log(`[e2e teardown] ${table}: deleted ${count ?? 0} rows`)
      }
    } catch (e: any) {
      console.warn(`[e2e teardown] ${table} threw: ${e?.message ?? e}`)
    }
  }
}

export default globalTeardown
