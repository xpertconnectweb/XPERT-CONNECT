/**
 * One-shot diagnostic: list every lawyer user that lacks a lawyer_id
 * (firm link). Useful right after applying the migrations to know
 * exactly which accounts the admin must fix in /admin/users.
 *
 *   npx tsx scripts/list-unlinked-lawyers.ts
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
config()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  const { data: unlinked, error } = await supabase
    .from('users')
    .select('id, name, username, email, firm_name, state')
    .eq('role', 'lawyer')
    .is('lawyer_id', null)

  if (error) { console.error(error); process.exit(1) }

  if (!unlinked || unlinked.length === 0) {
    console.log('✓ All lawyer users are linked to a firm.')
    return
  }

  console.log(`\n${unlinked.length} lawyer user(s) NOT linked to a firm:\n`)
  for (const u of unlinked) {
    console.log(`  • ${u.name}  (username: ${u.username})`)
    console.log(`    email:  ${u.email}`)
    console.log(`    firm:   ${u.firm_name || '(none)'}`)
    console.log(`    state:  ${u.state || '(none)'}`)
    console.log(`    id:     ${u.id}`)

    // Suggest possible firm matches by domain
    const domain = u.email?.split('@')[1]
    if (domain) {
      const { data: candidates } = await supabase
        .from('lawyers')
        .select('id, name, email, region')
        .ilike('email', `%@${domain}`)
        .limit(5)
      if (candidates && candidates.length > 0) {
        console.log(`    suggested firms (by email domain @${domain}):`)
        for (const c of candidates) {
          console.log(`        - ${c.name}  (id=${c.id}, region=${c.region || '?'})`)
        }
      } else {
        console.log(`    no firm with email @${domain} — search by name in /admin/users`)
      }
    }
    console.log()
  }
  console.log('Fix:  Login as admin → /admin/users → edit each user → set "Linked Firm" → Save.')
  console.log('Then: re-run the backfill UPDATE in the migration, then `npm run validate:schema`.')
}

main().catch((e) => { console.error(e); process.exit(1) })
