// PATCH /api/repartidores/[id]/asignar — asigna este repartidor a un pedido
// Body: { pedidoId: string }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: repartidorId } = await params
  const body = await request.json()
  const { pedidoId } = body

  if (!pedidoId) return NextResponse.json({ error: 'pedidoId requerido' }, { status: 400 })

  const supabase = await createClient()

  // Verificar que el repartidor pertenece a la ferretería
  const { data: repartidor } = await supabase
    .from('repartidores')
    .select('id, nombre, telefono')
    .eq('id', repartidorId)
    .eq('ferreteria_id', session.ferreteriaId)
    .eq('activo', true)
    .single()

  if (!repartidor) return NextResponse.json({ error: 'Repartidor no encontrado' }, { status: 404 })

  // Asignar al pedido (debe ser de esta ferretería)
  const { data, error } = await supabase
    .from('pedidos')
    .update({ repartidor_id: repartidorId })
    .eq('id', pedidoId)
    .eq('ferreteria_id', session.ferreteriaId)
    .select('id, repartidor_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, repartidor })
}
