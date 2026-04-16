// Interfaz móvil del repartidor — accesible solo con token, sin login
import { createClient } from '@supabase/supabase-js'
import { Truck, Package } from 'lucide-react'
import DeliveryView from './DeliveryView'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface Props {
  params: Promise<{ token: string }>
}

export default async function DeliveryPage({ params }: Props) {
  const { token } = await params
  const supabase = adminClient()

  // Identificar repartidor por token (bypasea RLS con service role)
  const { data: repartidor } = await supabase
    .from('repartidores')
    .select('id, nombre, ferreteria_id, ferreterias(nombre)')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (!repartidor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Truck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-700">Enlace inválido</h1>
          <p className="text-sm text-gray-400 mt-1">Este enlace no existe o fue desactivado.</p>
        </div>
      </div>
    )
  }

  const ferreteriaNombre = (repartidor.ferreterias as any)?.nombre ?? 'Ferretería'

  // Pedidos asignados pendientes de entrega
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select(`
      id, numero_pedido, nombre_cliente, telefono_cliente,
      direccion_entrega, total, estado, notas,
      cobrado_monto, cobrado_metodo, incidencia_tipo, incidencia_desc,
      created_at,
      clientes(nombre, telefono),
      zonas_delivery(nombre),
      items_pedido(id, nombre_producto, cantidad, precio_unitario)
    `)
    .eq('ferreteria_id', repartidor.ferreteria_id)
    .eq('repartidor_id', repartidor.id)
    .in('estado', ['confirmado', 'en_preparacion', 'enviado'])
    .order('created_at', { ascending: true })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-orange-500 text-white px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-sm">{repartidor.nombre}</p>
            <p className="text-xs text-orange-100">{ferreteriaNombre}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-2xl font-bold">{pedidos?.length ?? 0}</p>
            <p className="text-xs text-orange-100">pendientes</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        {!pedidos || pedidos.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">Sin entregas pendientes</p>
            <p className="text-sm text-gray-300 mt-1">¡Todo al día! 🎉</p>
          </div>
        ) : (
          <DeliveryView
            pedidos={pedidos as any}
            token={token}
          />
        )}
      </div>
    </div>
  )
}
