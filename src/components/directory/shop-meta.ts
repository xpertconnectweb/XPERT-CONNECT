import type { ComponentType } from 'react'
import { Car, CarFront, Wrench } from 'lucide-react'
import { INDEPENDENT } from '@/lib/body-shop-meta'

/**
 * Presentation for the Body Shops Directory's kind cards: independent
 * shops, then one card per chain. The chain list comes from the data, so a
 * chain without an entry here gets the neutral default.
 */
const KIND_META: Record<string, { icon: ComponentType<{ className?: string }>; accent: string }> = {
  [INDEPENDENT]: { icon: Wrench, accent: 'from-amber-500 to-orange-600' },
  'Gerber Collision & Glass': { icon: CarFront, accent: 'from-sky-500 to-blue-600' },
  'Caliber Collision': { icon: CarFront, accent: 'from-rose-500 to-red-600' },
  'Classic Collision': { icon: CarFront, accent: 'from-indigo-500 to-violet-600' },
  'Crash Champions': { icon: CarFront, accent: 'from-slate-600 to-slate-800' },
  Maaco: { icon: CarFront, accent: 'from-emerald-500 to-teal-600' },
  CARSTAR: { icon: CarFront, accent: 'from-cyan-500 to-sky-600' },
  'ABRA Auto Body': { icon: CarFront, accent: 'from-lime-500 to-green-600' },
}

const DEFAULT_KIND_META = { icon: Car, accent: 'from-gray-500 to-gray-700' }

export function shopKindMeta(kind: string) {
  return KIND_META[kind] ?? DEFAULT_KIND_META
}
