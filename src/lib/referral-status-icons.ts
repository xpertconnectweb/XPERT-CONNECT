import { Inbox, CalendarCheck, Scan, Stethoscope, CheckCircle2, HelpCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { isReferralStatus, type ReferralStatus } from './referral-status'

/**
 * The icon half of the status catalog, split out so `referral-status.ts` stays
 * free of `lucide-react` — it is imported by API routes that have no business
 * pulling React components into their bundle.
 */
export const REFERRAL_STATUS_ICON: Record<ReferralStatus, LucideIcon> = {
  received: Inbox,
  scheduled: CalendarCheck,
  mri: Scan,
  specialist: Stethoscope,
  final_mmi: CheckCircle2,
}

/** Mirrors `statusMeta`: safe on any string, including retired values. */
export function statusIcon(v: string | null | undefined): LucideIcon {
  return isReferralStatus(v) ? REFERRAL_STATUS_ICON[v] : HelpCircle
}
