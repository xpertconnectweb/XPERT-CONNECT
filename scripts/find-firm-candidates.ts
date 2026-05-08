/**
 * Diagnóstico: para cada lawyer user no linkeado, busca firms candidatas
 * en la tabla `lawyers` haciendo match por nombre parcial (ILIKE) y
 * lista todas las firms del estado del user.
 *
 *   npx tsx scripts/find-firm-candidates.ts
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !['law', 'firm', 'group', 'and', 'the', 'associates', 'legal'].includes(t))
}

async function main() {
  const { data: unlinked } = await supabase
    .from('users')
    .select('id, name, email, firm_name, state')
    .eq('role', 'lawyer')
    .is('lawyer_id', null)

  if (!unlinked || unlinked.length === 0) {
    console.log('No unlinked lawyer users.')
    return
  }

  for (const u of unlinked) {
    console.log(`\n${'═'.repeat(70)}`)
    console.log(`User: ${u.name}  (${u.email})`)
    console.log(`Declared firm: ${u.firm_name || '(none)'}   |   State: ${u.state || '(none)'}`)
    console.log(`${'═'.repeat(70)}`)

    // 1. Match by token from declared firm name
    const firmTokens = u.firm_name ? tokens(u.firm_name) : []
    const seen = new Set<string>()
    const matches: { id: string; name: string; address: string; email: string }[] = []
    for (const tok of firmTokens) {
      const { data: hits } = await supabase
        .from('lawyers')
        .select('id, name, address, email')
        .ilike('name', `%${tok}%`)
        .limit(10)
      for (const h of hits ?? []) {
        if (!seen.has(h.id)) {
          seen.add(h.id)
          matches.push(h)
        }
      }
    }

    if (matches.length > 0) {
      console.log(`\n  Found ${matches.length} firm(s) with similar name:`)
      for (const m of matches) {
        console.log(`    • ${m.name}`)
        console.log(`        id:      ${m.id}`)
        console.log(`        address: ${m.address}`)
        console.log(`        email:   ${m.email || '(none)'}`)
      }
    } else {
      console.log(`\n  ❌ No firm name matches "${u.firm_name}".`)
    }

    // 2. Also list all firms in their state
    if (u.state) {
      const pattern = `%, ${u.state} %`
      const { data: stateFirms } = await supabase
        .from('lawyers')
        .select('id, name, region, county')
        .ilike('address', pattern)
        .order('name')
      console.log(`\n  Firms in state ${u.state}: ${stateFirms?.length ?? 0}`)
      if (stateFirms && stateFirms.length > 0) {
        for (const f of stateFirms.slice(0, 15)) {
          console.log(`    • ${f.name}  (${f.region || ''}${f.county ? ' / ' + f.county : ''})  → id=${f.id}`)
        }
        if (stateFirms.length > 15) {
          console.log(`    ... and ${stateFirms.length - 15} more`)
        }
      }
    } else {
      console.log(`\n  ⚠ User has no state set — cannot narrow firm list by state.`)
      const { count } = await supabase.from('lawyers').select('id', { count: 'exact', head: true })
      console.log(`  Total firms in DB: ${count}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
