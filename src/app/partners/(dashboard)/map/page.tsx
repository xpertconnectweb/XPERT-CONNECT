'use client'

import dynamic from 'next/dynamic'

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

export default function PartnerMapPage() {
  return (
    <div className="-m-4 lg:-m-6">
      <MapView
        clinicsUrl="/api/partners/clinics"
        showLawyers={false}
      />
    </div>
  )
}
