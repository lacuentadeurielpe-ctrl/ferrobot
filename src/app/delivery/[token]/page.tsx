// Interfaz móvil del repartidor — accesible solo con token, sin login
import { createClient } from '@supabase/supabase-js'
import { Truck } from 'lucide-react'
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

const PEDIDO_SELECT = `
  id, numero_pedido, nombre_cliente, telefono_cliente,
  direccion_entrega, total, estado, estado_pago, notas,
  cobrado_monto, cobrado_metodo, incidencia_tipo, incidencia_desc,
  created_at,
  clientes(nombre, telefono),
  zonas_delivery(nombre),
  items_pedido(id, nombre_producto, cantidad, precio_unitario)
`

export default async function DeliveryPage({ params }: Props) {
  const { token } = await params
  const supabase = adminClient()

  const { data: repartidor } = await supabase
    .from('repartidores')
    .select('id, nombre, ferreteria_id, puede_registrar_deuda, ferreterias(nombre, modo_asignacion_delivery)')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (!repartidor) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Truck className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-700">Enlace inválido</h1>
          <p className="text-sm text-gray-400 mt-1">Este enlace no existe o fue desactivado.</p>
        </div>
      </div>
    )
  }

  const ferr = repartidor.ferreterias as any
  const ferreteriaNombre = ferr?.nombre ?? 'Empresa'
  const modo: 'manual' | 'libre' = ferr?.modo_asignacion_delivery === 'libre' ? 'libre' : 'manual'
  const hoy = new Date().toISOString().slice(0, 10)

  const [
    { data: pedidos },
    { data: cobrosHoy },
  ] = await Promise.all([
    supabase
      .from('pedidos')
      .select(PEDIDO_SELECT)
      .eq('ferreteria_id', repartidor.ferreteria_id)
      .eq('repartidor_id', repartidor.id)
      .in('estado', ['confirmado', 'en_preparacion', 'enviado'])
      .order('created_at', { ascending: true }),

    supabase
      .from('pedidos')
      .select('id, numero_pedido, total, cobrado_monto, cobrado_metodo, estado_pago, clientes(nombre), created_at')
      .eq('ferreteria_id', repartidor.ferreteria_id)
      .eq('repartidor_id', repartidor.id)
      .eq('estado', 'entregado')
      .gte('created_at', `${hoy}T00:00:00`)
      .order('created_at', { ascending: false }),
  ])

  let pedidosDisponibles: unknown[] = []
  if (modo === 'libre') {
    const { data: disponibles } = await supabase
      .from('pedidos')
      .select(PEDIDO_SELECT)
      .eq('ferreteria_id', repartidor.ferreteria_id)
      .is('repartidor_id', null)
      .eq('modalidad', 'delivery')
      .in('estado', ['confirmado', 'en_preparacion'])
      .order('created_at', { ascending: true })
    pedidosDisponibles = disponibles ?? []
  }

  const totalPendientes = pedidos?.length ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
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
            <p className="text-2xl font-bold">{totalPendientes}</p>
            <p className="text-xs text-orange-100">pendientes</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        <DeliveryView
          pedidos={(pedidos ?? []) as any}
          pedidosDisponibles={(pedidosDisponibles ?? []) as any}
          cobrosHoy={(cobrosHoy ?? []) as any}
          token={token}
          modo={modo}
          puedeRegistrarDeuda={repartidor.puede_registrar_deuda ?? false}
        />
      </div>
    </div>
  )
}
