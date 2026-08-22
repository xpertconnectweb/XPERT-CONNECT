import type {
  DecoratedClinic,
  DecoratedLawyer,
  PublicClinic,
  PublicLawyer,
} from '@/types/professionals'

/**
 * The single definition of what a non-admin professional may see about another
 * provider.
 *
 * Three routes withhold contact details — `/api/professionals/clinics`,
 * `/api/professionals/lawyers` and `/api/partners/clinics` — and each used to
 * do it with its own inline destructure. One shared helper means they cannot
 * drift, which matters because a divergence here is a privacy bug rather than a
 * cosmetic one.
 *
 * What is withheld: `phone` and the street `address`, so a provider cannot be
 * contacted directly around the referral flow.
 *
 * What is kept: `city`, `state` and `zipCode`. Coarse location is not contact
 * information, and without it searching or filtering by ZIP or city on these
 * maps is impossible — there is simply no field to match against. Street level
 * detail stays hidden.
 *
 * `/api/directory/lawyers` deliberately does NOT use this: the legal directory
 * exists to hand out attorney contact details, and its own route comment plus
 * `tests/api/directory-lawyers.test.ts` assert that phone and address survive.
 */
export function toPublicClinic(clinic: DecoratedClinic): PublicClinic {
  const { phone, address, ...rest } = clinic
  void phone
  void address
  return rest
}

export function toPublicLawyer(lawyer: DecoratedLawyer): PublicLawyer {
  const { phone, address, ...rest } = lawyer
  void phone
  void address
  return rest
}

export function toPublicClinics(clinics: readonly DecoratedClinic[]): PublicClinic[] {
  return clinics.map(toPublicClinic)
}

export function toPublicLawyers(lawyers: readonly DecoratedLawyer[]): PublicLawyer[] {
  return lawyers.map(toPublicLawyer)
}
