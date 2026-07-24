/** Skeleton loaders that mirror the real dashboard layout (no layout shift). */

function Shimmer({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-100 ${className ?? ''}`} />
}

function KpiSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between">
        <Shimmer className="h-10 w-10 rounded-xl" />
        <Shimmer className="h-5 w-12" />
      </div>
      <Shimmer className="mt-4 h-8 w-24" />
      <Shimmer className="mt-2 h-3 w-20" />
    </div>
  )
}

function CardSkeleton({ height = 240 }: { height?: number }) {
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white p-5 shadow-card">
      <Shimmer className="h-4 w-40" />
      <Shimmer className="mt-2 h-3 w-24" />
      <div style={{ height }} className="mt-5">
        <Shimmer className="h-full w-full" />
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CardSkeleton height={260} />
        </div>
        <CardSkeleton height={260} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <CardSkeleton height={200} />
        <CardSkeleton height={200} />
        <CardSkeleton height={200} />
      </div>
    </div>
  )
}
