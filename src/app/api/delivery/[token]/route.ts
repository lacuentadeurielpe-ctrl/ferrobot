// GET /api/delivery/[token] — obtiene los pedidos del repartidor y estado del modo
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const PEDIDO_SELECT = `
  id, numero_pedido, nombre_cliente, telefono_cliente,
  direccion_entrega, total, estado, notas,
  cobrado_monto, cobrado_metodo, incidencia_tipo, incidencia_desc,
  created_at,
  clientes(nombre, telefono),
  zonas_delivery(nombre),
  items_pedido(id, nombre_producto, cantidad, precio_unitario)
`

export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = adminClient()

  const { data: repartidor, error: repError } = await supabase
    .from('repartidores')
    .select('id, nombre, ferreteria_id, ferreterias(nombre, modo_asignacion_delivery)')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (repError || !repartidor) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
  }

  const ferr = repartidor.ferreterias as any
  const modo = ferr?.modo_asignacion_delivery ?? 'manual'

  // Pedidos asignados a este repartidor (activos)
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select(PEDIDO_SELECT)
    .eq('ferreteria_id', repartidor.ferreteria_id)
    .eq('repartidor_id', repartidor.id)
    .in('estado', ['confirmado', 'en_preparacion', 'enviado'])
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cobros del día (pedidos entregados hoy por este repartidor)
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: cobrosHoy } = await supabase
    .from('pedidos')
    .select('id, numero_pedido, total, cobrado_monto, cobrado_metodo, clientes(nombre), created_at')
    .eq('ferreteria_id', repartidor.ferreteria_id)
    .eq('repartidor_id', repartidor.id)
    .eq('estado', 'entregado')
    .gte('created_at', `${hoy}T00:00:00`)
    .order('created_at', { ascending: false })

  // Pedidos disponibles (solo en modo libre)
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

  return NextResponse.json({
    repartidor: {
      id: repartidor.id,
      nombre: repartidor.nombre,
      ferreteria: ferr?.nombre ?? 'Ferretería',
    },
    modo,
    pedidos: pedidos ?? [],
    pedidos_disponibles: pedidosDisponibles,
    cobros_hoy: cobrosHoy ?? [],
  })
}
