/**
 * Whether the client actually took the case on — one place, in order.
 *
 * Deliberately NOT part of `referral-status.ts`: this is a different axis. A
 * case can be dropped at any medical stage, so there is no order to walk, no
 * `nextStatus` and no terminal value. It shares the descriptor SHAPE so one
 * component can render either kind of pill.
 *
 * `drop` arrived in 2026-12, because a case the client declined had nowhere to
 * go and sat as `pending` for ever. It stays INSIDE the "% cases confirmed"
 * denominator (confirmed / total, unchanged) — which is precisely why every
 * surface also shows the raw Drop count, so a lost case is visible instead of
 * hiding behind a lower percentage.
 *
 * No React and no `lucide-react` here: reached from `validation.ts`, which is
 * reached from most API routes. Icons live in `case-confirmed-icons.ts`.
 */
import { humanize, type ReferralStatusMeta } from './referral-status'

export const CASE_CONFIRMED_VALUES = ['pending', 'confirmed', 'drop'] as const

export type CaseConfirmedValue = typeof CASE_CONFIRMED_VALUES[number]

export const DEFAULT_CASE_CONFIRMED: CaseConfirmedValue = 'pending'

/**
 * Structurally identical to a status descriptor, aliased rather than redeclared
 * so a pill component can take either without a union.
 */
export type CaseConfirmedMeta = ReferralStatusMeta

export const CASE_CONFIRMED_META: Record<CaseConfirmedValue, CaseConfirmedMeta> = {
  pending: {
    value: 'pending',
    label: 'Pending',
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    pillClass: 'bg-amber-100 text-amber-700',
    gradientClass: 'from-amber-500 to-amber-600',
    accentClass: 'bg-amber-400',
    iconClass: 'text-amber-500',
    tintGradient: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
    hex: '#f59e0b',
  },
  confirmed: {
    value: 'confirmed',
    label: 'Confirmed',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    pillClass: 'bg-emerald-100 text-emerald-700',
    gradientClass: 'from-emerald-500 to-emerald-600',
    accentClass: 'bg-emerald-400',
    iconClass: 'text-emerald-500',
    tintGradient: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
    hex: '#10b981',
  },
  // Slate, not red: a dropped case is CLOSED, not broken, and red is this app's
  // error idiom (delete buttons, the unavailable-clinics alert). Slate-500 also
  // sits two families away from the gray-400 neutral fallback below, so "Drop"
  // and "we do not recognise this value" never render as the same pill.
  drop: {
    value: 'drop',
    label: 'Drop',
    badgeClass: 'bg-slate-100 text-slate-700 ring-slate-500/30',
    pillClass: 'bg-slate-200 text-slate-700',
    gradientClass: 'from-slate-500 to-slate-600',
    accentClass: 'bg-slate-500',
    iconClass: 'text-slate-500',
    tintGradient: 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
    hex: '#64748b',
  },
}

/** Ordered descriptors — what every `.map()` in the UI iterates. */
export const CASE_CONFIRMED_LIST: readonly CaseConfirmedMeta[] =
  CASE_CONFIRMED_VALUES.map((v) => CASE_CONFIRMED_META[v])

export function isCaseConfirmed(v: unknown): v is CaseConfirmedValue {
  return typeof v === 'string' && (CASE_CONFIRMED_VALUES as readonly string[]).includes(v)
}

/** Never throws, never returns undefined — mirrors `statusMeta`. */
export function caseMeta(v: string | null | undefined): CaseConfirmedMeta {
  if (isCaseConfirmed(v)) return CASE_CONFIRMED_META[v]
  const raw = typeof v === 'string' && v ? v : 'unknown'
  return {
    value: raw,
    label: humanize(raw),
    badgeClass: 'bg-gray-100 text-gray-600 ring-gray-500/20',
    pillClass: 'bg-gray-100 text-gray-600',
    gradientClass: 'from-gray-400 to-gray-500',
    accentClass: 'bg-gray-300',
    iconClass: 'text-gray-400',
    tintGradient: 'linear-gradient(135deg, #f9fafb, #f3f4f6)',
    hex: '#9ca3af',
  }
}

export function caseLabel(v: string | null | undefined): string {
  return caseMeta(v).label
}
