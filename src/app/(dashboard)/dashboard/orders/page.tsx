import { createClient } from '@/lib/supabase/server'
import OrdersTable from '@/components/orders/OrdersTable'
import { ShoppingCart } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return null

  const [{ data: pedidos }, { data: productos }, { data: zonas }] = await Promise.all([
    supabase
      .from('pedidos')
      .select('*, clientes(nombre, telefono), zonas_delivery(nombre), items_pedido(*)')
      .eq('ferreteria_id', ferreteria.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('productos')
      .select('id, nombre, unidad, precio_base, precio_compra, stock')
      .eq('ferreteria_id', ferreteria.id)
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('zonas_delivery')
      .select('id, nombre, tiempo_estimado_min')
      .eq('ferreteria_id', ferreteria.id)
      .order('nombre'),
  ])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
          <ShoppingCart className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">Pedidos</h1>
          <p className="text-xs text-gray-500">{pedidos?.length ?? 0} pedidos en total</p>
        </div>
      </div>

      <OrdersTable
        pedidos={pedidos ?? []}
        productos={productos ?? []}
        zonas={zonas ?? []}
        ferreteriaId={ferreteria.id}
      />
    </div>
  )
}
