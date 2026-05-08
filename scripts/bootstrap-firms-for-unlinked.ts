/**
 * Bootstraps a `lawyers` row for every lawyer USER that has no firm
 * linked, then links the user to the new firm and re-runs the
 * referrals backfill so any orphan referrals get rewritten to point
 * at a real lawyer entity.
 *
 *   npx tsx scripts/bootstrap-firms-for-unlinked.ts          # dry run
 *   npx tsx scripts/bootstrap-firms-for-unlinked.ts --apply  # write
 *
 * The new firm row is populated from data the user already provided
 * at signup: name, firm_name, email, state. address/lat/lng are
 * left as placeholders (lat=0, lng=0, address="Address pending —
 * complete in /admin/lawyers"). MapView already skips any clinic or
 * lawyer where lat===0 && lng===0, so the firm will not appear on
 * the public map until an admin fills in real coordinates.
 *
 * Idempotent: re-running on a clean DB is a no-op.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'

config({ path: '.env.local' })
config()

const apply = process.argv.includes('--apply')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const PLACEHOLDER_ADDRESS = (state: string | null) =>
  `Address pending — update in /admin/lawyers${state ? `, ${state}` : ''}`

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
}

interface LawyerUser {
  id: string
  name: string
  email: string
  firm_name: string | null
  state: string | null
}

async function main() {
  console.log(c.bold('\nBootstrap lawyer firms for unlinked users'))
  console.log(c.dim(apply ? 'Mode: APPLY (writing changes)' : 'Mode: DRY RUN (no writes — pass --apply to write)\n'))

  const { data: unlinked, error: uErr } = await supabase
    .from('users')
    .select('id, name, email, firm_name, state')
    .eq('role', 'lawyer')
    .is('lawyer_id', null)
  if (uErr) { console.error(uErr); process.exit(1) }
  if (!unlinked || unlinked.length === 0) {
    console.log(c.green('✓'), 'All lawyer users already linked. Nothing to do.')
    return
  }

  console.log(`Found ${unlinked.length} lawyer user(s) without a firm.\n`)

  const summary: { user: string; firm: string; firmId: string; orphansFixed?: number }[] = []

  for (const u of unlinked as LawyerUser[]) {
    const firmName =
      (u.firm_name && u.firm_name.trim()) ||
      `${u.name}${u.state ? ` — ${u.state}` : ''}`
    const firmId = `l-${uuidv4().slice(0, 8)}`

    console.log(`${c.bold(u.name)}  (${u.email})`)
    console.log(`  → would create firm:  ${firmName}`)
    console.log(`     id=${firmId}, state=${u.state ?? '(none)'}`)

    if (apply) {
      // 1. Create the firm
      const { error: insErr } = await supabase.from('lawyers').insert({
        id: firmId,
        name: firmName,
        address: PLACEHOLDER_ADDRESS(u.state),
        lat: 0,
        lng: 0,
        phone: '',
        practice_areas: [],
        email: u.email,
        region: u.state ?? null,
        county: null,
        zip_code: null,
        available: false, // hidden from referrals UI until admin fills in details
      })
      if (insErr) { console.log(c.red(`     ✗ insert lawyer failed: ${insErr.message}\n`)); continue }
      console.log(c.green(`     ✓ firm inserted`))

      // 2. Link the user
      const { error: updErr } = await supabase
        .from('users')
        .update({ lawyer_id: firmId })
        .eq('id', u.id)
      if (updErr) { console.log(c.red(`     ✗ link user failed: ${updErr.message}\n`)); continue }
      console.log(c.green(`     ✓ user linked to firm`))

      // 3. Re-write any orphan referrals this user originated
      const { data: rewriteResult, error: rewErr } = await supabase
        .from('referrals')
        .update({ lawyer_id: firmId })
        .eq('created_by_user_id', u.id)
        .eq('creator_role', 'lawyer')
        .eq('lawyer_id', u.id) // only rows that still hold the legacy user-id
        .select('id')
      if (rewErr) {
        console.log(c.yellow(`     ⚠ orphan rewrite query failed: ${rewErr.message}`))
      } else {
        const n = rewriteResult?.length ?? 0
        console.log(c.green(`     ✓ rewrote ${n} orphan referral(s) to point at the new firm`))
        summary.push({ user: u.name, firm: firmName, firmId, orphansFixed: n })
      }
      console.log()
    } else {
      summary.push({ user: u.name, firm: firmName, firmId })
      console.log(c.dim('     (dry run — nothing written)\n'))
    }
  }

  console.log(c.bold('\nSummary'))
  for (const s of summary) {
    console.log(
      `  ${c.green('•')} ${s.user}  →  ${s.firm}  (${s.firmId})${
        s.orphansFixed != null ? `   [${s.orphansFixed} orphan(s) fixed]` : ''
      }`
    )
  }

  if (apply) {
    console.log(c.bold('\nNext steps:'))
    console.log('  1. Login as admin → /admin/lawyers → for each new firm,')
    console.log('     fill in address + coordinates so they appear on the map')
    console.log('     and flip "available" back to true.')
    console.log('  2. Run:')
    console.log(c.dim('       ALTER TABLE referrals VALIDATE CONSTRAINT referrals_lawyer_id_fkey;'))
    console.log('     in Supabase SQL Editor to enforce the FK on every row.')
    console.log('  3. Confirm with:')
    console.log(c.dim('       npm run validate:schema'))
  } else {
    console.log(c.bold('\nNo changes written. To apply, run:'))
    console.log(c.dim('  npx tsx scripts/bootstrap-firms-for-unlinked.ts --apply'))
  }
}

main().catch((e) => { console.error(c.red('Fatal:'), e); process.exit(1) })
