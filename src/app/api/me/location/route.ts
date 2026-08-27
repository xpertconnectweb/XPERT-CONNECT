/**
 * Where the signed-in user works.
 *
 * The map opened on the whole of North America. A lawyer in Florida was shown
 * Winnipeg, Quebec and Bermuda, with six hundred clinics rendered as blue
 * bubbles across a continent, and the product did nothing useful until they
 * told it where they were. That is the first thing anyone sees, and it was the
 * one screen state nobody had looked at.
 *
 * `MapView` cannot resolve this itself: it is a client component behind
 * `dynamic({ ssr: false })`, and the session carries the user's `clinicId` or
 * `lawyerId` but not the coordinates behind them.
 *
 * Deliberately the SAME resolution the search bias uses — `resolveCallerBias`,
 * including its in-process cache and its refusal to trust a coordinate at
 * (0, 0) or outside the United States. Two different answers to "where is this
 * user" would be two things to keep in step, and this codebase has already paid
 * for that once in the referral policy.
 *
 * Returns `{ lat, lng }` or `{}`. Never an error for "you have no entity": a
 * referrer or an admin belongs to nowhere in particular, and the map simply
 * falls back to their state.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { resolveCallerBias } from '@/lib/geocoding/caller-bias'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { session, error } = await requireAuth()
  if (error) return error

  const bias = await resolveCallerBias(session.user)

  return NextResponse.json(bias ? { lat: bias.lat, lng: bias.lng } : {}, {
    // Quantised to ~11 km by `resolveCallerBias` and refreshed every five
    // minutes there, so a short private cache costs nothing and saves a round
    // trip on every visit to the map.
    headers: { 'Cache-Control': 'private, max-age=60' },
  })
}
