'use client'

import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'

const MapView = dynamic(
  () => import('@/components/professionals/MapView').then((mod) => mod.MapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy/20 border-t-gold" />
      </div>
    ),
  }
)

export default function MapPage() {
  const { data: session } = useSession()
  const isClinic = session?.user?.role === 'clinic'

  // Clinic users only see specialists (lawyers) — never other chiros.
  return (
    <div className="-m-4 lg:-m-6">
      <MapView showClinics={!isClinic} showLawyers={true} />
    </div>
  )
}
