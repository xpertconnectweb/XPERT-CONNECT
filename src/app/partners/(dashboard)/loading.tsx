export default function PartnerDashboardLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gray-100 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-6 w-10 rounded-md bg-gray-100 animate-pulse" />
                <div className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="h-5 w-32 rounded bg-gray-100 animate-pulse mb-2" />
          <div className="h-3 w-24 rounded bg-gray-100 animate-pulse mb-6" />
          <div className="h-[220px] rounded-xl bg-gray-50 animate-pulse" />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="h-5 w-32 rounded bg-gray-100 animate-pulse mb-2" />
            <div className="h-3 w-24 rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-gray-50 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
