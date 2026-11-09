/**
 * The public Body Shops Directory.
 *
 * Same contract as the lawyers directory (`DirectoryListing` and
 * `DirectoryContact` in ./professionals): the listing carries name and
 * place only, and phone, website and street address are handed out one
 * shop at a time by the "Get information" form. Both shapes are explicit
 * allowlists, built field by field in `src/lib/body-shops.ts`.
 */

export type BodyShopState = 'FL' | 'MN'

export interface BodyShopListing {
  id: string
  name: string
  /** The chain's name, or `INDEPENDENT` (src/lib/body-shop-meta.ts). */
  kind: string
  city: string
  /** Bare, the storage convention: "Hennepin", not "Hennepin County". */
  county: string
  state: BodyShopState
  zipCode: string
}

/** What a visitor gets back from the "Get information" form, and only from there. */
export interface BodyShopContact {
  id: string
  name: string
  phone: string
  website?: string
  address: string
}
