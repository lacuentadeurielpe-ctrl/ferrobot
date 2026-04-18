'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResolverIncidencia({ incidenciaId }: { incidenciaId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function resolver() {
    setLoading(true)
    const res = await fetch('/api/superadmin/incidencias', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-superadmin-secret': process.env.NEXT_PUBLIC_SUPERADMIN_SECRET ?? '',
      },
      body: JSON.stringify({ ids: [incidenciaId] }),
    })
    if (res.ok) router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={resolver}
      disabled={loading}
      className="shrink-0 px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-lg disabled:opacity-50 transition-colors"
    >
      {loading ? '...' : 'Resolver'}
    </button>
  )
}
