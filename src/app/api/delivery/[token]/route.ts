// GET /api/delivery/[token] — obtiene los pedidos asignados al repartidor
// Autenticación: token en URL (no requiere sesión Supabase)
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Usamos el service role para bypassear RLS — la autenticación es el token del repartidor
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = adminClient()

  // Identificar al repartidor por su token
  const { data: repartidor, error: repError } = await supabase
    .from('repartidores')
    .select('id, nombre, ferreteria_id, ferreterias(nombre)')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (repError || !repartidor) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
  }

  // Pedidos de delivery asignados a este repartidor (activos)
  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select(`
      id, numero_pedido, nombre_cliente, telefono_cliente,
      direccion_entrega, total, estado,
      cobrado_monto, cobrado_metodo, incidencia_tipo, incidencia_desc,
      notas, created_at,
      clientes(nombre, telefono),
      zonas_delivery(nombre),
      items_pedido(nombre_producto, cantidad, precio_unitario)
    `)
    .eq('ferreteria_id', repartidor.ferreteria_id)
    .eq('repartidor_id', repartidor.id)
    .in('estado', ['confirmado', 'en_preparacion', 'enviado'])
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    repartidor: {
      id: repartidor.id,
      nombre: repartidor.nombre,
      ferreteria: (repartidor.ferreterias as any)?.nombre ?? 'Ferretería',
    },
    pedidos: pedidos ?? [],
  })
}
