/**
 * Fill in `users.state` for accounts that are missing it.
 *
 * Why it matters: `/api/professionals/clinics` and `/api/professionals/lawyers`
 * scope their results with `getClinicsByState(user.state)`. When `state` is
 * null they fall through to `getClinics()` / `getLawyers()`, so the account
 * sees BOTH states — a Florida attorney's map opens on the whole of North
 * America and their first search results are Minnesota clinics. The search
 * itself is fine; it is being handed the wrong corpus.
 *
 * The state is derived from the linked clinic or firm's own address rather than
 * guessed from the username, because "Florida_Centers" is a label and the
 * address is the record.
 *
 * Dry run by default — nothing is written without `--apply`:
 *
 *   npx tsx scripts/backfill-user-state.ts
 *   npx tsx scripts/backfill-user-state.ts --apply
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { parseAddress } from '../src/lib/address'

config({ path: '.env.local' })
config()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')

/** Only these roles have their feed scoped by state. */
const SCOPED_ROLES = ['lawyer', 'clinic', 'directory']

async function main() {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, role, state, clinic_id, lawyer_id')
  if (error) {
    console.error(error)
    process.exit(1)
  }

  const candidates = (users ?? []).filter(
    (u) => SCOPED_ROLES.includes(u.role) && !u.state
  )

  if (candidates.length === 0) {
    console.log('✓ Every state-scoped account already has a state.')
    return
  }

  console.log(
    `${candidates.length} account(s) without a state${APPLY ? '' : ' — dry run, pass --apply to write'}\n`
  )

  for (const user of candidates) {
    let address: string | null = null
    let source = ''

    if (user.clinic_id) {
      const { data } = await supabase
        .from('clinics')
        .select('name, address')
        .eq('id', user.clinic_id)
        .single()
      address = data?.address ?? null
      source = `clinic "${data?.name ?? user.clinic_id}"`
    } else if (user.lawyer_id) {
      const { data } = await supabase
        .from('lawyers')
        .select('name, address')
        .eq('id', user.lawyer_id)
        .single()
      address = data?.address ?? null
      source = `firm "${data?.name ?? user.lawyer_id}"`
    }

    if (!address) {
      console.log(
        `  ? ${user.username} (${user.role}) — not linked to a clinic or firm, ` +
          'so there is nothing to derive from. Set it by hand in /admin/users.'
      )
      continue
    }

    const state = parseAddress(address).state
    if (!state) {
      console.log(`  ? ${user.username} (${user.role}) — could not read a state from ${source}: "${address}"`)
      continue
    }

    if (!APPLY) {
      console.log(`  → ${user.username} (${user.role}) would become ${state}, from its ${source}`)
      continue
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ state })
      .eq('id', user.id)

    if (updateError) {
      console.log(`  ✗ ${user.username}: ${updateError.message}`)
    } else {
      console.log(`  ✓ ${user.username} (${user.role}) set to ${state}, from its ${source}`)
    }
  }
}

main()
