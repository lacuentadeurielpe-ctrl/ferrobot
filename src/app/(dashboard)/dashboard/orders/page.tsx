import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'
import OrdersTable from '@/components/orders/OrdersTable'
import { ShoppingCart } from 'lucide-react'
import { redirect } from 'next/navigation'
import type { PermisoMap } from '@/lib/auth/permisos'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  const [{ data: pedidos }, { data: productos }, { data: zonas }, { data: repartidores }, { data: ferreteriaData }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*, clientes(nombre, telefono), zonas_delivery(nombre), items_pedido(*), metodo_pago, estado_pago, pago_confirmado_por, pago_confirmado_at')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('productos')
      .select('id, nombre, unidad, precio_base, precio_compra, stock')
      .eq('ferreteria_id', session.ferreteriaId)
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('zonas_delivery')
      .select('id, nombre, tiempo_estimado_min')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('nombre'),
    supabase
      .from('repartidores')
      .select('id, nombre, telefono, activo')
      .eq('ferreteria_id', session.ferreteriaId)
      .order('nombre'),
    supabase
      .from('ferreterias')
      .select('nubefact_token_enc, tipo_ruc')
      .eq('id', session.ferreteriaId)   // FERRETERÍA AISLADA
      .single(),
  ])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-zinc-100 border border-zinc-200 rounded-2xl flex items-center justify-center">
          <ShoppingCart className="w-4 h-4 text-zinc-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-zinc-950 tracking-tight">Pedidos</h1>
          <p className="text-xs text-zinc-400">{pedidos?.length ?? 0} pedidos en total</p>
        </div>
      </div>

      <OrdersTable
        pedidos={pedidos ?? []}
        productos={productos ?? []}
        zonas={zonas ?? []}
        ferreteriaId={session.ferreteriaId}
        rol={session.rol}
        repartidores={repartidores ?? []}
        permisos={session.permisos as PermisoMap}
        nubefactConfigurado={!!ferreteriaData?.nubefact_token_enc}
        tieneRuc={ferreteriaData?.tipo_ruc !== 'sin_ruc'}
      />
    </div>
  )
}
