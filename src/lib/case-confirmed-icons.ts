import { Clock, CheckCircle2, Ban, HelpCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { isCaseConfirmed, type CaseConfirmedValue } from './case-confirmed'

/**
 * The icon half of the case catalog — see `referral-status-icons.ts` for why
 * the split exists.
 */
export const CASE_CONFIRMED_ICON: Record<CaseConfirmedValue, LucideIcon> = {
  pending: Clock,
  confirmed: CheckCircle2,
  // Ban (circle-with-slash) reads "not proceeding". XCircle would read "failed".
  drop: Ban,
}

/** Mirrors `caseMeta`: safe on any string. */
export function caseIcon(v: string | null | undefined): LucideIcon {
  return isCaseConfirmed(v) ? CASE_CONFIRMED_ICON[v] : HelpCircle
}
