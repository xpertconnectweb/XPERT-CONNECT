/**
 * The referral treatment lifecycle — one place, in order.
 *
 * Everything about a referral status lives here: the stored key, the label the
 * client reads, and every colour idiom the call sites need. Before this file
 * existed the set was hand-typed in 15 places and its look was re-invented in
 * seven maps that had already drifted apart — ClinicDashboard painted
 * `received` amber while StatusBadge painted it blue, and nothing caught it
 * because that map was typed `Record<string, ...>`. Add a status here and
 * TypeScript names every screen that has to account for it.
 *
 * As of 2026-12 this catalog backs BOTH tables: `referrals.status` and
 * `referrer_referrals.status`, which used to run a routing vocabulary
 * (pending | assigned | in_process | completed) under the same column heading.
 * `ReferrerReferralStatus` is kept as an alias so a call site still says which
 * column it means, but the two must resolve to ONE list — a second, drifting
 * copy is the exact failure this file exists to prevent, and
 * `tests/unit/referral-status.test.ts` asserts they stay identical.
 *
 * Whether a partner referral has been routed to a provider is NOT a status: it
 * is read off `referrer_referrals.assigned_clinic_id` / `assigned_lawyer_id`.
 *
 * No React and no `lucide-react` in this file: it is reached from
 * `validation.ts`, which is reached from most API routes, and icon components
 * have no business in a server bundle. Icons live in `referral-status-icons.ts`.
 */

export const REFERRAL_STATUSES = [
  'received',
  'scheduled',
  'mri',
  'specialist',
  'final_mmi',
] as const

export type ReferralStatus = typeof REFERRAL_STATUSES[number]

export const DEFAULT_REFERRAL_STATUS: ReferralStatus = 'received'
export const TERMINAL_REFERRAL_STATUS: ReferralStatus = 'final_mmi'

/** Every status a clinic still has work to do on. Drives `activePipeline`. */
export const ACTIVE_REFERRAL_STATUSES: readonly ReferralStatus[] =
  REFERRAL_STATUSES.filter((s) => s !== TERMINAL_REFERRAL_STATUS)

/**
 * One descriptor per status, carrying every visual idiom already in use.
 *
 * Tailwind cannot see constructed class names, so each string is a literal —
 * do not refactor these into `bg-${hue}-50` templates or the purge will eat
 * them.
 */
export interface ReferralStatusMeta {
  readonly value: string
  /** The client-facing name, e.g. 'In Process'. */
  readonly label: string
  /** Soft pill with a ring — StatusBadge, admin dashboard rows. */
  readonly badgeClass: string
  /** Stronger pill, no ring — the admin per-row <select>. */
  readonly pillClass: string
  /** Used after `bg-gradient-to-r` — the two detail-modal headers. */
  readonly gradientClass: string
  /** Solid accent — KPI left rule, pipeline segment, legend dot. */
  readonly accentClass: string
  /** Icon tint on the KPI tile. */
  readonly iconClass: string
  /** Two-stop tint for the KPI icon well (inline `style`, not a class). */
  readonly tintGradient: string
  /** Raw hex for Recharts / SegmentBar. */
  readonly hex: string
}

export const REFERRAL_STATUS_META: Record<ReferralStatus, ReferralStatusMeta> = {
  received: {
    value: 'received',
    label: 'Received',
    badgeClass: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    pillClass: 'bg-blue-100 text-blue-700',
    gradientClass: 'from-blue-500 to-blue-600',
    accentClass: 'bg-blue-400',
    iconClass: 'text-blue-500',
    tintGradient: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
    hex: '#3b82f6',
  },
  scheduled: {
    value: 'scheduled',
    label: 'Scheduled',
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    pillClass: 'bg-amber-100 text-amber-700',
    gradientClass: 'from-amber-500 to-amber-600',
    accentClass: 'bg-amber-400',
    iconClass: 'text-amber-500',
    tintGradient: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
    hex: '#f59e0b',
  },
  mri: {
    value: 'mri',
    label: 'MRI',
    badgeClass: 'bg-cyan-50 text-cyan-700 ring-cyan-600/20',
    pillClass: 'bg-cyan-100 text-cyan-700',
    gradientClass: 'from-cyan-500 to-cyan-600',
    accentClass: 'bg-cyan-400',
    iconClass: 'text-cyan-500',
    tintGradient: 'linear-gradient(135deg, #ecfeff, #cffafe)',
    hex: '#06b6d4',
  },
  specialist: {
    value: 'specialist',
    label: 'Specialist',
    badgeClass: 'bg-violet-50 text-violet-700 ring-violet-600/20',
    pillClass: 'bg-violet-100 text-violet-700',
    gradientClass: 'from-violet-500 to-violet-600',
    accentClass: 'bg-violet-400',
    iconClass: 'text-violet-500',
    tintGradient: 'linear-gradient(135deg, #f5f3ff, #ede9fe)',
    hex: '#8b5cf6',
  },
  final_mmi: {
    value: 'final_mmi',
    label: 'Final MMI',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    pillClass: 'bg-emerald-100 text-emerald-700',
    gradientClass: 'from-emerald-500 to-emerald-600',
    accentClass: 'bg-emerald-400',
    iconClass: 'text-emerald-500',
    tintGradient: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
    hex: '#10b981',
  },
}

/** Ordered descriptors — what every `.map()` in the UI iterates. */
export const REFERRAL_STATUS_LIST: readonly ReferralStatusMeta[] =
  REFERRAL_STATUSES.map((s) => REFERRAL_STATUS_META[s])

/**
 * Retired vocabulary. `activity_logs.details` is append-only and keeps the old
 * status names forever, so the history would otherwise render them raw. Read
 * only — these are never valid values to write.
 */
const LEGACY_STATUS_LABELS: Record<string, string> = {
  in_process: 'In Process',
  attended: 'Attended',
}

/** Shared with `case-confirmed.ts` so it does not copy the same three lines. */
export function humanize(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function neutralMeta(raw: string, label: string): ReferralStatusMeta {
  return {
    value: raw,
    label,
    badgeClass: 'bg-gray-100 text-gray-600 ring-gray-500/20',
    pillClass: 'bg-gray-100 text-gray-600',
    gradientClass: 'from-gray-400 to-gray-500',
    accentClass: 'bg-gray-300',
    iconClass: 'text-gray-400',
    tintGradient: 'linear-gradient(135deg, #f9fafb, #f3f4f6)',
    hex: '#9ca3af',
  }
}

export function isReferralStatus(v: unknown): v is ReferralStatus {
  return typeof v === 'string' && (REFERRAL_STATUSES as readonly string[]).includes(v)
}

/**
 * Never throws, never returns undefined. This is what lets a stale browser tab
 * or a half-applied migration degrade to a grey pill instead of white-screening
 * the referrals page — StatusBadge used to do `STATUS_CONFIG[status].icon` and
 * TypeError on anything unexpected.
 */
export function statusMeta(v: string | null | undefined): ReferralStatusMeta {
  if (isReferralStatus(v)) return REFERRAL_STATUS_META[v]
  const raw = typeof v === 'string' && v ? v : 'unknown'
  return neutralMeta(raw, LEGACY_STATUS_LABELS[raw] ?? humanize(raw))
}

export function statusLabel(v: string | null | undefined): string {
  return statusMeta(v).label
}

/** Position in the lifecycle, or -1 for a value we do not recognise. */
export function statusIndex(v: string | null | undefined): number {
  return isReferralStatus(v) ? REFERRAL_STATUSES.indexOf(v) : -1
}

export function isTerminal(v: string | null | undefined): boolean {
  return v === TERMINAL_REFERRAL_STATUS
}

/** The single forward step, or null at the end / for an unknown value. */
export function nextStatus(v: string | null | undefined): ReferralStatus | null {
  const i = statusIndex(v)
  if (i < 0 || i >= REFERRAL_STATUSES.length - 1) return null
  return REFERRAL_STATUSES[i + 1]
}
