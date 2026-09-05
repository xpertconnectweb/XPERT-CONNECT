import {
  Scale, HeartPulse, Gavel, Users, ScrollText, Plane, Briefcase, Home,
} from 'lucide-react'
import type { SidebarIcon } from '@/components/shared/BaseSidebar'

/**
 * Presentation for the canonical areas in src/lib/practice-areas.ts.
 *
 * Kept out of that lib so it stays free of React and Tailwind — it is
 * imported by API routes. Lives here rather than in AttorneyDirectory
 * because the public directory renders the same category cards, and two
 * copies of this map would drift the moment an area is added.
 *
 * Areas an admin adds via /admin/settings fall back to the neutral
 * default below.
 */
export const AREA_META: Record<string, { icon: SidebarIcon; accent: string }> = {
  'Personal Injury': { icon: HeartPulse, accent: 'from-rose-500 to-red-600' },
  'Criminal Defense': { icon: Gavel, accent: 'from-slate-600 to-slate-800' },
  'Family Law': { icon: Users, accent: 'from-amber-500 to-orange-600' },
  'Estate Planning': { icon: ScrollText, accent: 'from-emerald-500 to-teal-600' },
  Immigration: { icon: Plane, accent: 'from-sky-500 to-blue-600' },
  'Business Law': { icon: Briefcase, accent: 'from-indigo-500 to-violet-600' },
  'Civil Litigation': { icon: Scale, accent: 'from-cyan-500 to-sky-600' },
  'Real Estate Law': { icon: Home, accent: 'from-lime-500 to-green-600' },
}

export const DEFAULT_AREA_META = { icon: Scale, accent: 'from-gray-500 to-gray-700' }

export function metaFor(area: string) {
  return AREA_META[area] ?? DEFAULT_AREA_META
}
