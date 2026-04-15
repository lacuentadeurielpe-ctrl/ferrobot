export default function CotizacionesLoading() {
  return (
    <div className="p-6 sm:p-8 animate-pulse">
      <div className="h-7 w-44 bg-gray-200 rounded mb-6" />
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-28 h-7 bg-gray-100 rounded-full" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-4">
            <div className="w-4 h-4 bg-gray-100 rounded" />
            <div className="flex-1">
              <div className="h-4 w-36 bg-gray-200 rounded mb-1.5" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
            <div className="h-5 w-16 bg-gray-200 rounded" />
            <div className="h-7 w-24 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
