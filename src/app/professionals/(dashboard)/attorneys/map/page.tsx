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

/**
 * The only place in the app where attorney pins are switched on. The
 * whole lawyer path (markers, popups, practice-area chips, clustering)
 * already existed in MapView but was dark, because /professionals/map
 * and /partners/map both pass showLawyers={false}.
 *
 * Role gating lives in DashboardShell.onAuthenticated, which confines
 * the directory role to /professionals/attorneys/*.
 */
export default function AttorneyMapPage() {
  return (
    <div className="-m-4 lg:-m-6">
      <MapView
        lawyersUrl="/api/directory/lawyers"
        showLawyers
        showClinics={false}
      />
    </div>
  )
}
