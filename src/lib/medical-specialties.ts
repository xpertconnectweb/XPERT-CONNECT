export const MEDICAL_SPECIALTY_TYPES = [
  'Orthopedist',
  'Orthopedic Surgeon',
  'Neurologist',
  'Physical Therapist',
  'Pain Management',
  'General Practitioner',
  'Radiologist',
  'Other',
] as const

export type MedicalSpecialtyType = typeof MEDICAL_SPECIALTY_TYPES[number]

// `clinics.specialties` JSONB holds free-form strings imported from
// the original CSVs (e.g. "Chiropractic", "Orthopedics"). Map each
// specialist TYPE shown to the user to the set of clinic-tag values
// that should match. Case-insensitive matching is the caller's job.
//
// The canonical vocabulary now lives in `clinic-specialties.ts`; the values
// below must stay in step with `CLINIC_SPECIALTIES`.
//
// CORRECTED 2026-08-22. The original lists were written against tags that were
// assumed to exist rather than measured, and most of them do not appear in the
// corpus at all — 'Neurology', 'Radiology', 'Imaging', 'Family Medicine',
// 'Internal Medicine', 'Primary Care' and 'General Practice' are on ZERO of the
// 696 clinics. That silently made three of the eight specialist types match
// nothing in the referral picker. Every tag below is now one that actually
// occurs, with its corpus count in the comment.
export const SPECIALTY_TYPE_TO_CLINIC_TAGS: Record<MedicalSpecialtyType, string[]> = {
  // 'Orthopedics' 1 · 'Orthopedic Rehabilitation' 12
  Orthopedist: ['Orthopedics', 'Orthopedic Rehabilitation'],
  // 'Orthopedics' 1 — no surgical tag exists in the data. Kept narrow on
  // purpose: rehab clinics must not be offered as surgeons.
  'Orthopedic Surgeon': ['Orthopedics'],
  // 'Neurological Rehabilitation' 2 — the only neuro tag present.
  Neurologist: ['Neurological Rehabilitation'],
  // 'Physical Therapy' 170 · 'Outpatient Therapy' 23 · 'Manual Therapy' 1 · 'Dry Needling' 1
  'Physical Therapist': [
    'Physical Therapy',
    'Outpatient Therapy',
    'Manual Therapy',
    'Dry Needling',
  ],
  // 'Pain Management' 106
  'Pain Management': ['Pain Management'],
  // 'General Medicine' 8 · 'Medical Clinic' 16
  'General Practitioner': ['General Medicine', 'Medical Clinic'],
  // No radiology or imaging tag exists on any clinic. Left empty rather than
  // pointing at unrelated tags — an empty result is honest, a wrong referral is
  // not. Populate once imaging centres are tagged.
  Radiologist: [],
  Other: [],
}

/** Reverse index of the map above: folded clinic tag -> specialist type. */
const TYPE_BY_CLINIC_TAG = new Map<string, MedicalSpecialtyType>(
  (Object.entries(SPECIALTY_TYPE_TO_CLINIC_TAGS) as [MedicalSpecialtyType, string[]][])
    .flatMap(([type, tags]) => tags.map((tag) => [tag.toLowerCase(), type] as const))
)

/**
 * Given a clinic's specialty tags, returns the specialist type it best
 * represents, or null.
 *
 * `MedicalSpecialistReferralModal.inferSpecialty` currently matches clinic tags
 * against the specialist TYPE names directly, and 'Pain Management' is the only
 * string present in both vocabularies — so the referral form's specialty
 * dropdown almost never pre-fills. This is the lookup that actually bridges the
 * two vocabularies; wire the modal to it to make the pre-fill work.
 */
export function specialtyTypeForClinicTags(
  tags: readonly string[] | null | undefined
): MedicalSpecialtyType | null {
  if (!Array.isArray(tags)) return null
  for (const tag of tags) {
    if (typeof tag !== 'string') continue
    const type = TYPE_BY_CLINIC_TAG.get(tag.trim().toLowerCase())
    if (type) return type
  }
  return null
}
