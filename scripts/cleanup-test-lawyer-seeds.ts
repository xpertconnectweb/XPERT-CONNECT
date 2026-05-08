/**
 * Cleanup of the two seeded lawyer users (Alex Rodriguez, Minnesota
 * Attorney), the two placeholder firms created by
 * `bootstrap-firms-for-unlinked.ts`, and the 5 test referrals Alex
 * had generated.
 *
 *   npx tsx scripts/cleanup-test-lawyer-seeds.ts          # dry run
 *   npx tsx scripts/cleanup-test-lawyer-seeds.ts --apply  # delete
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
config()

const apply = process.argv.includes('--apply')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const TEST_USER_USERNAMES = ['alex_rodriguez', 'mn_lawyer']
const PLACEHOLDER_FIRM_NAMES = [
  'Rodriguez & Associates Law Firm',
  'MN Legal Group',
]

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
}

async function main() {
  console.log(c.bold('\nCleanup of test lawyer seed data'))
  console.log(c.dim(apply ? 'Mode: APPLY (deleting rows)\n' : 'Mode: DRY RUN — pass --apply to actually delete\n'))

  // 1. Find the test users
  const { data: users } = await supabase
    .from('users')
    .select('id, username, name, email, lawyer_id')
    .in('username', TEST_USER_USERNAMES)
  if (!users || users.length === 0) {
    console.log(c.green('Already clean — no test users found.'))
    return
  }

  const userIds = users.map((u) => u.id)
  const linkedFirmIds = users.map((u) => u.lawyer_id).filter(Boolean) as string[]

  console.log(c.bold('Users to delete:'))
  for (const u of users) console.log(`  • ${u.name}  (id=${u.id}, email=${u.email})`)

  // 2. Find referrals created by these users (so we can delete them or warn)
  const { data: refs } = await supabase
    .from('referrals')
    .select('id, patient_name, lawyer_id, created_at')
    .in('created_by_user_id', userIds)
  console.log(`\n${c.bold('Referrals to delete')} (created_by these users): ${refs?.length ?? 0}`)
  for (const r of refs ?? []) {
    console.log(`  • ${r.id}  patient=${r.patient_name}  lawyer_id=${r.lawyer_id}`)
  }

  // 3. Find the placeholder firms (only delete by exact name match, never any of the 178 real firms)
  const { data: firms } = await supabase
    .from('lawyers')
    .select('id, name, available')
    .in('name', PLACEHOLDER_FIRM_NAMES)
    .eq('available', false) // safeguard: only ours, which were inserted as available=false
  console.log(`\n${c.bold('Placeholder firms to delete')}: ${firms?.length ?? 0}`)
  for (const f of firms ?? []) {
    console.log(`  • ${f.name}  (id=${f.id})`)
  }

  // 4. Sanity check: never delete a firm that has any other lawyer user linked
  for (const f of firms ?? []) {
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('lawyer_id', f.id)
      .not('id', 'in', `(${userIds.map((id) => `"${id}"`).join(',')})`)
    if ((count ?? 0) > 0) {
      console.log(c.red(`\n✗ Aborting: firm ${f.id} (${f.name}) has ${count} other user(s) linked. Refusing to delete.`))
      process.exit(1)
    }
  }

  if (!apply) {
    console.log(c.yellow('\nDRY RUN — no changes written.'))
    console.log(c.dim('Re-run with --apply to delete the rows above.'))
    return
  }

  console.log(c.bold('\nApplying...\n'))

  // Order matters because of FKs:
  //   referrals → users (created_by_user_id ON DELETE SET NULL — safe)
  //   referrals → lawyers (lawyer_id NOT NULL — must delete referrals first)
  //   users → lawyers (lawyer_id FK — null out before deleting firm)

  if (refs && refs.length > 0) {
    const { error } = await supabase
      .from('referrals')
      .delete()
      .in('id', refs.map((r) => r.id))
    if (error) { console.log(c.red(`✗ delete referrals: ${error.message}`)); process.exit(1) }
    console.log(c.green(`✓ deleted ${refs.length} referral(s)`))
  }

  // Null out the user.lawyer_id link so we can delete the firms
  const { error: nullErr } = await supabase
    .from('users')
    .update({ lawyer_id: null })
    .in('id', userIds)
  if (nullErr) { console.log(c.red(`✗ null user.lawyer_id: ${nullErr.message}`)); process.exit(1) }
  console.log(c.green(`✓ unlinked users from firms`))

  if (firms && firms.length > 0) {
    const { error } = await supabase
      .from('lawyers')
      .delete()
      .in('id', firms.map((f) => f.id))
    if (error) { console.log(c.red(`✗ delete firms: ${error.message}`)); process.exit(1) }
    console.log(c.green(`✓ deleted ${firms.length} placeholder firm(s)`))
  }

  const { error: delUserErr } = await supabase
    .from('users')
    .delete()
    .in('id', userIds)
  if (delUserErr) { console.log(c.red(`✗ delete users: ${delUserErr.message}`)); process.exit(1) }
  console.log(c.green(`✓ deleted ${userIds.length} test user(s)`))

  console.log(c.green(c.bold('\n✓ Cleanup complete.')))
  console.log(c.dim('\nNext: npm run validate:schema'))
}

main().catch((e) => { console.error(c.red('Fatal:'), e); process.exit(1) })
