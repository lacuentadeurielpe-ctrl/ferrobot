import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { redirect } from 'next/navigation'
import { Truck } from 'lucide-react'
import DeliveryDashboard from './DeliveryDashboard'
import { inicioDiaLima } from '@/lib/tiempo'

export const dynamic = 'force-dynamic'

export default async function DeliveryPage() {
  const session = await getSessionInfo()
  if (!session) redirect('/auth/login')

  const supabase = await createClient()

  // Cargar entregas del día (activas + completadas hoy)
  const hoy = new Date().toISOString().slice(0, 10)

  // Próximos 14 días para pedidos programados (Lima UTC = hoy 05:00Z → +14 días)
  const inicioHoy   = inicioDiaLima(0)
  const fin14dias   = inicioDiaLima(15)   // exclusivo → 14 días completos

  const [{ data: entregas }, { data: pedidosProgramados }] = await Promise.all([
    supabase
      .from('entregas')
      .select(`
        id, estado, orden_en_ruta, eta_actual,
        distancia_km, duracion_estimada_min, duracion_real_min,
        salio_at, llego_at,
        pedidos(id, numero_pedido, nombre_cliente, direccion_entrega, total, eta_minutos, estado),
        vehiculos(id, nombre, tipo),
        repartidores(id, nombre)
      `)
      .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
      .or(`estado.in.(pendiente,carga,en_ruta),and(estado.eq.entregado,llego_at.gte.${hoy}T00:00:00),and(estado.eq.fallida,created_at.gte.${hoy}T00:00:00)`)
      .order('orden_en_ruta', { ascending: true })
      .order('created_at', { ascending: true }),

    // Pedidos programados para los próximos 14 días
    supabase
      .from('pedidos')
      .select('id, numero_pedido, nombre_cliente, telefono_cliente, direccion_entrega, total, modalidad, fecha_entrega_programada, zonas_delivery(nombre)')
      .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
      .eq('estado', 'programado')
      .gte('fecha_entrega_programada', inicioHoy)
      .lt('fecha_entrega_programada', fin14dias)
      .order('fecha_entrega_programada', { ascending: true }),
  ])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
          <Truck className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Delivery</h1>
          <p className="text-sm text-zinc-400">Rutas activas y pedidos programados</p>
        </div>
      </div>

      <DeliveryDashboard
        initialEntregas={(entregas ?? []) as any}
        initialProgramados={(pedidosProgramados ?? []) as any}
      />
    </div>
  )
}
