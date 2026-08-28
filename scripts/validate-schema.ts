/**
 * Validates that the Supabase production schema matches what the
 * post-2026-05 codebase expects. Run AFTER applying the migrations:
 *
 *   npx tsx scripts/validate-schema.ts
 *
 * Exits 0 if every required column exists, 1 otherwise.
 *
 * It uses simple `select … limit 0` probes so it does not touch any
 * row but PostgREST still validates the column list against the
 * schema cache. A column-not-found error surfaces as `error.message`
 * containing the column name and is reported back to the operator.
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Load env from .env.local first (dev), then .env as a fallback. Without this,
// `npm run validate:schema` would only work if the operator exported the
// Supabase vars manually before each run.
config({ path: '.env.local' })
config()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.'
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
})

interface Probe {
  table: string
  columns: string[]
  /** Human-readable note shown if this probe fails. */
  why: string
}

const PROBES: Probe[] = [
  {
    table: 'users',
    columns: [
      'id',
      'role',
      'clinic_id',
      'lawyer_id',
      'firm_name',
      'state',
      'phone_e164',
      'phone_verified_at',
      'sms_referral_alerts',
      'sms_consent_at',
      'sms_consent_version',
      'sms_consent_text',
      'sms_last_sent_at',
    ],
    why: 'users.lawyer_id links a lawyer login to its firm; the phone/sms_* columns carry the SMS opt-in (2026-08-sms-notifications.sql).',
  },
  {
    table: 'phone_verifications',
    columns: ['user_id', 'phone_e164', 'code_hash', 'expires_at', 'attempts', 'locked_until'],
    why: 'holds the pending 6-digit code and its rate gates.',
  },
  {
    table: 'sms_opt_outs',
    columns: ['phone_e164', 'opted_out_at', 'reason', 'resumed_at'],
    why: 'a STOP is keyed by phone, not by user, and must survive account deletion.',
  },
  {
    table: 'sms_messages',
    columns: ['id', 'to_e164', 'kind', 'status', 'twilio_sid', 'error_code'],
    why: 'delivery log — Vercel free-tier logs are retained about an hour.',
  },
  {
    table: 'lawyers',
    columns: ['id', 'name', 'email', 'practice_areas', 'city', 'state', 'place_id', 'geocoded_at'],
    why: 'lawyers entity table — referenced by users.lawyer_id and referrals.lawyer_id.',
  },
  {
    table: 'clinics',
    columns: [
      'id', 'name', 'email', 'specialties', 'available',
      // Added by 2026-08-structured-addresses.sql, and worth probing because
      // LAWYER_COLUMNS and CLINIC_COLUMNS in src/lib/data.ts now name them.
      // PostgREST rejects an entire select that mentions a column which does
      // not exist, so a database missing this migration fails EVERY clinic and
      // lawyer read at once — the map, the directory, the admin tables and the
      // referral form together. Better to hear it from this script.
      'street', 'city', 'state', 'zip_code', 'place_id', 'place_provider',
      'geocode_precision', 'geocoded_at',
    ],
    why: 'clinics entity table, including the structured address columns.',
  },
  {
    table: 'geocode_cache',
    columns: ['cache_key', 'provider', 'mode', 'payload', 'expires_at'],
    why: 'shared address-lookup cache — without it every lookup pays the provider.',
  },
  {
    table: 'geocode_usage',
    columns: ['user_id', 'kind', 'window_start', 'calls'],
    why: 'per-user geocoding quota — the only thing bounding a runaway render loop.',
  },
  {
    table: 'referrals',
    columns: [
      'id',
      'lawyer_id',
      'clinic_id',
      'created_by_user_id',
      'creator_role',
      'patient_name',
      'patient_phone',
      'case_type',
      'coverage',
      'pip',
      'insurance_company',
      'claim_number',
      'adjuster_name',
      'adjuster_phone',
      'adjuster_email',
      'notes',
      'status',
    ],
    why: 'referrals must have all post-migration columns (insurance/adjuster + creator).',
  },
  {
    table: 'contacts',
    columns: ['id', 'email', 'service'],
    why: 'public contact form.',
  },
  {
    table: 'newsletter_subscribers',
    columns: ['id', 'email'],
    why: 'newsletter subscriptions.',
  },
  {
    table: 'referrer_referrals',
    columns: ['id', 'referrer_id', 'service_needed', 'assigned_clinic_id', 'assigned_lawyer_id', 'status', 'case_confirmed'],
    why: 'referrer submissions, the medical status the referrer watches, the confirm/drop outcome, and the columns admin routes with.',
  },
  {
    table: 'settings',
    columns: ['key', 'value'],
    why: 'platform settings — backs specialties_list and practice_areas_list.',
  },
  {
    table: 'activity_logs',
    columns: ['id', 'user_id', 'action', 'target_type', 'created_at'],
    why: 'admin activity feed.',
  },
]

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
}

async function probe(p: Probe): Promise<{ ok: boolean; failed?: string[] }> {
  // First try the full column list — single round-trip happy path.
  const fullProbe = await supabase
    .from(p.table)
    .select(p.columns.join(', '))
    .limit(0)
  if (!fullProbe.error) return { ok: true }

  // On failure, narrow down to the offending columns one-by-one.
  const failed: string[] = []
  for (const col of p.columns) {
    const single = await supabase.from(p.table).select(col).limit(0)
    if (single.error) failed.push(col)
  }
  return { ok: false, failed }
}

/**
 * CHECK constraints are invisible to PostgREST `select` probes, so the
 * allowed-role list can't be probed without attempting a write. Report
 * the roles actually in use instead and let the operator compare them
 * against VALID_ROLES in src/lib/validation.ts.
 */
async function auditRoles(): Promise<void> {
  const { data, error } = await supabase.from('users').select('role').limit(10000)
  if (error) {
    console.log(c.yellow('⚠'), 'Could not audit user roles:', error.message)
    return
  }
  const roles = Array.from(
    new Set((data ?? []).map((r: { role: string }) => r.role))
  ).sort()
  console.log(c.dim('  roles in use:'), roles.join(', ') || '(none)')
}

async function main() {
  console.log(c.bold('\nXpert Connect — schema validation'))
  console.log(c.dim(`URL: ${url?.replace(/https?:\/\//, '')}\n`))

  let allOk = true
  for (const p of PROBES) {
    const result = await probe(p)
    if (result.ok) {
      console.log(`${c.green('✓')} ${c.bold(p.table)} — ${p.columns.length} columns OK`)
      if (p.table === 'users') await auditRoles()
    } else {
      allOk = false
      console.log(`${c.red('✗')} ${c.bold(p.table)} — missing column(s):`)
      for (const f of result.failed ?? []) console.log(`    ${c.red('-')} ${f}`)
      console.log(`  ${c.yellow('why')}: ${p.why}`)
    }
  }

  // Audit: orphan referrals whose lawyer_id is not in lawyers (post-migration drift)
  console.log()
  const { data: orphans, error: orphErr } = await supabase
    .from('referrals')
    .select('id, lawyer_id, lawyer_name, created_at')
    .limit(2000)
  if (orphErr) {
    console.log(c.yellow('⚠'), 'Could not run orphan audit:', orphErr.message)
  } else {
    const lawyerIds = new Set(
      (
        await supabase.from('lawyers').select('id').limit(10000)
      ).data?.map((r: { id: string }) => r.id) ?? []
    )
    const orphanRefs = (orphans ?? []).filter(
      (r: { lawyer_id: string }) => !lawyerIds.has(r.lawyer_id)
    )
    if (orphanRefs.length === 0) {
      console.log(c.green('✓'), 'No orphan referrals — every lawyer_id maps to a firm.')
    } else {
      allOk = false
      console.log(c.red('✗'), `${orphanRefs.length} orphan referral(s) — lawyer_id has no matching firm:`)
      for (const r of orphanRefs.slice(0, 10)) {
        console.log(`    ${c.dim('-')} ${r.id}  →  lawyer_id=${r.lawyer_id}  (${r.lawyer_name})`)
      }
      console.log(c.yellow('  fix:'), 'Link the lawyer USER to a firm in /admin/users, then re-run the backfill UPDATE in the migration.')
    }
  }

  console.log()
  if (allOk) {
    console.log(c.green(c.bold('All schema checks passed.')))
    process.exit(0)
  } else {
    console.log(c.red(c.bold('Schema validation failed.')))
    console.log(c.dim('Apply pending migrations and re-run this script.'))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(c.red('Fatal:'), err)
  process.exit(1)
})
