import type {
  AdminSafeUser,
  DecoratedClinic,
  DecoratedLawyer,
  DirectoryListing,
  PublicClinic,
  PublicLawyer,
  User,
} from '@/types/professionals'
import { phoneLast4 } from '@/lib/phone'

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
 * What is withheld: `phone`, the free-text `address` and the `street` column,
 * so a provider cannot be contacted directly around the referral flow.
 *
 * What is kept: `city`, `state` and `zipCode`. Coarse location is not contact
 * information, and without it searching or filtering by ZIP or city on these
 * maps is impossible — there is simply no field to match against. Street level
 * detail stays hidden.
 *
 * NOTE THE SHAPE OF THIS FUNCTION. It withholds by destructuring named fields
 * out and spreading the rest, which means every NEW column on `clinics` is
 * public by default. `street` is the first one where that mattered:
 * `2026-08-structured-addresses.sql` adds it, and without the line below it
 * would have shipped the exact detail this whole function exists to hide, on
 * three routes, with the paragraph above still claiming otherwise. Adding a
 * column is therefore a decision about this function too.
 *
 * `/api/directory/lawyers` deliberately does NOT use this: the legal directory
 * exists to hand out attorney contact details, and its own route comment plus
 * `tests/api/directory-lawyers.test.ts` assert that phone and address survive.
 */
export function toPublicClinic(clinic: DecoratedClinic): PublicClinic {
  const {
    phone,
    address,
    street,
    placeId,
    placeProvider,
    geocodePrecision,
    geocodedAt,
    ...rest
  } = clinic
  void phone
  void address
  void street
  void placeId
  void placeProvider
  void geocodePrecision
  void geocodedAt
  return rest
}

export function toPublicLawyer(lawyer: DecoratedLawyer): PublicLawyer {
  const {
    phone,
    address,
    street,
    placeId,
    placeProvider,
    geocodePrecision,
    geocodedAt,
    ...rest
  } = lawyer
  void phone
  void address
  void street
  void placeId
  void placeProvider
  void geocodePrecision
  void geocodedAt
  return rest
}

/**
 * What the admin panel may see about a user.
 *
 * Widening USER_COLUMNS to carry `phone_e164` put a mobile number
 * into every read path, including `GET /api/admin/users`, which
 * previously stripped only `password`. That route is the one place a
 * single admin session could export every user's phone, and the admin
 * table has no use for the whole number — it shows a masked one and
 * whether alerts are on.
 *
 * Apply this on BOTH the list response and the PATCH response. The
 * PATCH one is easy to forget because it returns a single record.
 */
export function toAdminSafeUser(user: User, optedOut = false): AdminSafeUser {
  const { password, phoneE164, ...rest } = user
  void password

  return {
    ...rest,
    phoneLast4: phoneE164 ? phoneLast4(phoneE164) : undefined,
    phoneVerified: Boolean(user.phoneVerifiedAt),
    smsOptedOut: optedOut,
  }
}

export function toPublicClinics(clinics: readonly DecoratedClinic[]): PublicClinic[] {
  return clinics.map(toPublicClinic)
}

export function toPublicLawyers(lawyers: readonly DecoratedLawyer[]): PublicLawyer[] {
  return lawyers.map(toPublicLawyer)
}

/**
 * The PUBLIC lawyers directory shape.
 *
 * The inverse of the three helpers above: they hide contact details so
 * a professional cannot route around the platform, and this one keeps
 * them because a public directory of firms nobody can call is useless.
 * The safety is not in this function, it is in the caller -- only rows
 * with directory_public = true are ever passed here, and those are
 * firms seeded from public sources, never an attorney who signed up.
 *
 * Built field by field instead of spreading the rest. `toPublicLawyer`
 * spreads, which is why adding the `street` column silently published
 * it on three routes. Naming every field means the next column added
 * to `lawyers` is private until someone edits this list on purpose.
 */
export function toDirectoryListing(lawyer: DecoratedLawyer): DirectoryListing {
  return {
    id: lawyer.id,
    name: lawyer.name,
    address: lawyer.address,
    phone: lawyer.phone,
    website: lawyer.website,
    practiceAreas: lawyer.practiceAreas,
    // `region` on a lawyer row holds a city name; `city` is parsed from
    // the address on the read path. Same precedence the directory list
    // already uses when it renders a row.
    city: lawyer.region || lawyer.city || null,
    county: lawyer.county,
    zipCode: lawyer.zipCode ?? null,
    state: lawyer.state ?? null,
    lat: lawyer.lat,
    lng: lawyer.lng,
  }
}

export function toDirectoryListings(
  lawyers: readonly DecoratedLawyer[]
): DirectoryListing[] {
  return lawyers.map(toDirectoryListing)
}
