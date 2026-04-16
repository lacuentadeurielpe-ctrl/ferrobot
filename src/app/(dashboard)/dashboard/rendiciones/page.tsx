import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import { checkPermiso } from '@/lib/auth/permisos'
import { redirect } from 'next/navigation'
import { ClipboardList, Loader2 } from 'lucide-react'
import RendicionesView from '@/components/rendiciones/RendicionesView'
import type { PermisoMap } from '@/lib/auth/permisos'

export const dynamic = 'force-dynamic'

export default async function RendicionesPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')
  if (!checkPermiso(session, 'ver_caja_dia')) redirect('/dashboard')

  const supabase = await createClient()

  const [{ data: rendiciones }, { data: repartidores }] = await Promise.all([
    supabase
      .from('rendiciones')
      .select('*, repartidores(id, nombre, telefono)')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60),

    supabase
      .from('repartidores')
      .select('id, nombre')
      .eq('ferreteria_id', session.ferreteriaId)
      .eq('activo', true)
      .order('nombre'),
  ])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-purple-100 rounded-lg flex items-center justify-center">
          <ClipboardList className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Rendiciones</h1>
          <p className="text-xs text-gray-500">Cierre de caja de repartidores por día</p>
        </div>
      </div>

      <RendicionesView
        rendiciones={rendiciones ?? []}
        repartidores={repartidores ?? []}
        permisos={session.permisos as PermisoMap}
        rol={session.rol}
      />
    </div>
  )
}
