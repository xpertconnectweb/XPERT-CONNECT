import type { MapItem } from './types'

/**
 * Who may refer to whom.
 *
 *   lawyer -> clinic   send a client for treatment
 *   clinic -> lawyer   send a patient for representation
 *   clinic -> clinic   send a patient to a medical specialist
 *   lawyer -> lawyer   never
 *
 * This lives in its own module because duplicating it has already cost a
 * shipped bug. The rule was written in May inside the Leaflet popup builder,
 * when clinic users saw attorney pins. In July the map switched clinic users to
 * seeing other clinics, and `MapView` gained a clinic->clinic branch routing to
 * `MedicalSpecialistReferralModal` — but the popup's copy of the rule was never
 * updated, so that branch was unreachable and clinic users had no Refer button
 * on any marker at all. It went unnoticed until August.
 *
 * The panel row now offers the same action, which would have been a second
 * copy. One module, two renderers.
 *
 * `MapView` already excludes the viewer's own clinic from the index, so a
 * clinic can never be offered a referral to itself.
 */
export function canRefer(userRole: string | undefined, item: Pick<MapItem, 'type'>): boolean {
  const isLawyerViewer = userRole === 'lawyer'
  const isClinicViewer = userRole === 'clinic'
  return (
    (isLawyerViewer && item.type === 'clinic') ||
    (isClinicViewer && item.type === 'lawyer') ||
    (isClinicViewer && item.type === 'clinic')
  )
}

/**
 * Whether the action can be taken right now, as opposed to being permitted in
 * principle. Separate from `canRefer` because the two answers need different
 * treatment: no permission means no control at all, while "not accepting
 * referrals" is worth saying out loud.
 */
export function canReferNow(
  userRole: string | undefined,
  item: Pick<MapItem, 'type' | 'available'>
): boolean {
  return canRefer(userRole, item) && item.available
}

/** What the button says. A clinic refers patients; a firm sends referrals. */
export function referLabel(userRole: string | undefined): string {
  return userRole === 'clinic' ? 'Refer Patient' : 'Send Referral'
}
