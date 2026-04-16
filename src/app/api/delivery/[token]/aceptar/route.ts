// POST /api/delivery/[token]/aceptar — repartidor toma un pedido disponible (modo libre)
// Operación atómica: si otro repartidor ya lo tomó, retorna error 409
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = adminClient()

  const { data: repartidor } = await supabase
    .from('repartidores')
    .select('id, ferreteria_id')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (!repartidor) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const body = await request.json()
  const { pedido_id } = body
  if (!pedido_id) return NextResponse.json({ error: 'pedido_id requerido' }, { status: 400 })

  // Atomic update: only assigns if repartidor_id IS NULL (not yet taken)
  const { data, error } = await supabase
    .from('pedidos')
    .update({ repartidor_id: repartidor.id })
    .eq('id', pedido_id)
    .eq('ferreteria_id', repartidor.ferreteria_id)
    .is('repartidor_id', null)
    .in('estado', ['confirmado', 'en_preparacion', 'enviado'])
    .select('id, numero_pedido, nombre_cliente, telefono_cliente, direccion_entrega, total, estado, notas, cobrado_monto, cobrado_metodo, incidencia_tipo, incidencia_desc, created_at, repartidor_id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'El pedido ya fue tomado por otro repartidor' }, { status: 409 })

  return NextResponse.json(data)
}
