import { NextResponse } from 'next/server'
import { getBodyShopListings } from '@/lib/body-shops'

/**
 * The feed for the public Body Shops Directory: every verified shop's
 * name, kind and place, and nothing else. Phone, website and street address
 * come only from ./[id]/inquiry, after the visitor fills in the form.
 *
 * Unauthenticated, like /api/public/lawyers; `src/middleware.ts` guards
 * /professionals, /admin and /partners only.
 *
 * Static on purpose. The data is a file shipped with the build
 * (`src/data/body-shops.json`), so it cannot change between deploys, and
 * a deploy replaces the CDN copy. That is unlike the lawyers feed, whose
 * rows live in Supabase and can change without a deploy, which is why that
 * route is dynamic and tag-cached.
 */
export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(getBodyShopListings())
}
