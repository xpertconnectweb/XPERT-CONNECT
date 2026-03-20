export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Title skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-4 w-72 rounded-md bg-gray-50 animate-pulse" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gray-100 animate-pulse" />
              <div className="space-y-1.5">
                <div className="h-6 w-10 rounded-md bg-gray-100 animate-pulse" />
                <div className="h-3 w-14 rounded-md bg-gray-50 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="p-5 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-4 flex-1 rounded-md bg-gray-50 animate-pulse" />
              <div className="h-4 w-20 rounded-md bg-gray-50 animate-pulse" />
              <div className="h-4 w-16 rounded-md bg-gray-50 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
