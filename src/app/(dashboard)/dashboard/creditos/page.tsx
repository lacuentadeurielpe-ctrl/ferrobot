import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import { checkPermiso } from '@/lib/auth/permisos'
import CreditosTable from '@/components/creditos/CreditosTable'
import { CreditCard } from 'lucide-react'
import { redirect } from 'next/navigation'
import type { PermisoMap } from '@/lib/auth/permisos'

export const dynamic = 'force-dynamic'

export default async function CreditosPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')
  if (!checkPermiso(session, 'ver_creditos')) redirect('/dashboard')

  const supabase = await createClient()

  // Marcar automáticamente como vencidos
  await supabase
    .from('creditos')
    .update({ estado: 'vencido' })
    .eq('ferreteria_id', session.ferreteriaId)
    .eq('estado', 'activo')
    .lt('fecha_limite', new Date().toISOString().slice(0, 10))

  const { data: creditos } = await supabase
    .from('creditos')
    .select(`
      *,
      clientes(id, nombre, telefono),
      pedidos(id, numero_pedido, total),
      abonos_credito(id, monto, metodo_pago, notas, registrado_por, created_at)
    `)
    .eq('ferreteria_id', session.ferreteriaId)
    .order('created_at', { ascending: false })

  const total = creditos?.length ?? 0
  const activos = creditos?.filter((c) => c.estado === 'activo').length ?? 0
  const vencidos = creditos?.filter((c) => c.estado === 'vencido').length ?? 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
          <CreditCard className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Créditos</h1>
          <p className="text-xs text-gray-500">
            {total} total · {activos} activo{activos !== 1 ? 's' : ''}
            {vencidos > 0 && <span className="text-red-500 ml-1">· {vencidos} vencido{vencidos !== 1 ? 's' : ''}</span>}
          </p>
        </div>
      </div>

      <CreditosTable
        creditos={creditos ?? []}
        rol={session.rol}
        permisos={session.permisos as PermisoMap}
      />
    </div>
  )
}
