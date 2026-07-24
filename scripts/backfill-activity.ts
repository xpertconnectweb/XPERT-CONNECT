/**
 * One-time reconciliation: the activity feed only ever logged admin CRUD, so
 * every referral created since the feed's last entry (2026-05-22) is missing.
 * This backfills a `referral_created` activity_log for each referral/referrer-
 * referral created AFTER the newest existing activity_log.
 *
 * Idempotent: skips any referral that already has a log row (by target_id).
 * Reversible: every backfilled row carries details.backfill = true.
 *
 *   npx tsx scripts/backfill-activity.ts          # dry run (prints plan)
 *   npx tsx scripts/backfill-activity.ts --apply  # actually insert
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })
config()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) { console.error('Missing Supabase env vars.'); process.exit(1) }
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')

interface LogRow {
  user_id: string
  user_name: string
  action: string
  target_type: string
  target_id: string
  target_name: string
  details: Record<string, unknown>
  created_at: string
}

async function main() {
  // 1) Find the freeze point — newest existing activity_log.
  const { data: newest } = await supabase
    .from('activity_logs')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
  const cutoff = newest?.[0]?.created_at ?? '1970-01-01T00:00:00Z'
  console.log('Feed froze at (newest activity_log):', cutoff)

  // 2) target_ids already logged (idempotency guard).
  const { data: existingLogs } = await supabase
    .from('activity_logs')
    .select('target_id')
    .eq('target_type', 'referral')
  const alreadyLogged = new Set((existingLogs ?? []).map((r) => r.target_id).filter(Boolean))

  const rows: LogRow[] = []

  // 3) Clinic/lawyer referrals created after the cutoff.
  const { data: referrals, error: rErr } = await supabase
    .from('referrals')
    .select('id, referral_kind, creator_role, created_by_user_id, lawyer_name, clinic_name, target_clinic_name, specialist_type, patient_name, status, created_at')
    .gt('created_at', cutoff)
    .order('created_at', { ascending: true })
  if (rErr) { console.error('referrals query failed:', rErr.message); process.exit(1) }

  for (const r of referrals ?? []) {
    if (alreadyLogged.has(r.id)) continue
    const kind = r.referral_kind ?? 'lawyer'
    let userName: string
    let details: Record<string, unknown>
    if (kind === 'medical_specialist') {
      userName = r.clinic_name || 'Clinic'
      details = { to: r.target_clinic_name || 'Unassigned specialist', specialty: r.specialist_type, backfill: true }
    } else if (r.creator_role === 'clinic') {
      userName = r.clinic_name || 'Clinic'
      details = { to: r.lawyer_name || '—', kind: 'clinic→lawyer', backfill: true }
    } else {
      userName = r.lawyer_name || 'Lawyer'
      details = { to: r.clinic_name || '—', kind: 'lawyer→clinic', backfill: true }
    }
    rows.push({
      user_id: r.created_by_user_id || 'backfill',
      user_name: userName,
      action: 'referral_created',
      target_type: 'referral',
      target_id: r.id,
      target_name: r.patient_name || '—',
      details,
      created_at: r.created_at,
    })
  }

  // 4) Referrer (partner) referrals created after the cutoff.
  const { data: rrefs, error: rrErr } = await supabase
    .from('referrer_referrals')
    .select('id, referrer_id, referrer_name, client_name, service_needed, state, created_at')
    .gt('created_at', cutoff)
    .order('created_at', { ascending: true })
  if (rrErr) {
    console.warn('referrer_referrals query skipped:', rrErr.message)
  } else {
    for (const r of rrefs ?? []) {
      if (alreadyLogged.has(r.id)) continue
      rows.push({
        user_id: r.referrer_id || 'backfill',
        user_name: r.referrer_name || 'Partner',
        action: 'referral_created',
        target_type: 'referral',
        target_id: r.id,
        target_name: r.client_name || '—',
        details: { service: r.service_needed, state: r.state, backfill: true },
        created_at: r.created_at,
      })
    }
  }

  rows.sort((a, b) => a.created_at.localeCompare(b.created_at))

  console.log(`\n${rows.length} activity row(s) to backfill:\n`)
  for (const r of rows) {
    console.log(`  ${r.created_at} | ${r.user_name} created a referral for ${r.target_name}  (→ ${(r.details as any).to ?? (r.details as any).service})`)
  }

  if (!rows.length) { console.log('\nNothing to backfill.'); return }

  if (!APPLY) {
    console.log('\nDRY RUN. Re-run with --apply to insert these rows.')
    return
  }

  const { error: insErr } = await supabase.from('activity_logs').insert(rows)
  if (insErr) { console.error('\nInsert failed:', insErr.message); process.exit(1) }
  console.log(`\n✅ Inserted ${rows.length} backfilled activity row(s).`)
}

main().catch((e) => { console.error(e); process.exit(1) })
