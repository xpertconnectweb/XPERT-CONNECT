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
export const SPECIALTY_TYPE_TO_CLINIC_TAGS: Record<MedicalSpecialtyType, string[]> = {
  Orthopedist: ['Orthopedics', 'Orthopedic', 'Orthopedist'],
  'Orthopedic Surgeon': ['Orthopedic Surgery', 'Orthopedic Surgeon', 'Orthopedics'],
  Neurologist: ['Neurology', 'Neurologist'],
  'Physical Therapist': ['Physical Therapy', 'PT', 'Physical Therapist'],
  'Pain Management': ['Pain Management', 'Pain Medicine'],
  'General Practitioner': ['General Practice', 'Family Medicine', 'Internal Medicine', 'Primary Care'],
  Radiologist: ['Radiology', 'Radiologist', 'Imaging'],
  Other: [],
}
