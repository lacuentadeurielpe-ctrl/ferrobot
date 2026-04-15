export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-8 animate-pulse">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="h-7 w-64 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-40 bg-gray-100 rounded" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5">
            <div className="w-10 h-10 bg-gray-100 rounded-lg mb-3" />
            <div className="h-8 w-12 bg-gray-200 rounded mb-1" />
            <div className="h-4 w-28 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* Chart + top products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 mb-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-4 sm:p-5 h-48" />
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 h-48" />
      </div>

      {/* Bottom cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 h-40" />
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-5 h-40" />
      </div>
    </div>
  )
}
