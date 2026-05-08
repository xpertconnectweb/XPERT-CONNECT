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
    columns: ['id', 'role', 'clinic_id', 'lawyer_id', 'firm_name', 'state'],
    why: 'users.lawyer_id is required to link a lawyer login to its firm.',
  },
  {
    table: 'lawyers',
    columns: ['id', 'name', 'email', 'practice_areas'],
    why: 'lawyers entity table — referenced by users.lawyer_id and referrals.lawyer_id.',
  },
  {
    table: 'clinics',
    columns: ['id', 'name', 'email', 'specialties', 'available'],
    why: 'clinics entity table.',
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

async function main() {
  console.log(c.bold('\nXpert Connect — schema validation'))
  console.log(c.dim(`URL: ${url?.replace(/https?:\/\//, '')}\n`))

  let allOk = true
  for (const p of PROBES) {
    const result = await probe(p)
    if (result.ok) {
      console.log(`${c.green('✓')} ${c.bold(p.table)} — ${p.columns.length} columns OK`)
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
