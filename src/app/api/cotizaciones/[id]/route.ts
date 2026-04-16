import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

// PATCH /api/cotizaciones/[id] — actualizar precios de items (antes de aprobar)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { id } = await params

  const body = await request.json()
  // body.items = [{ id, precio_unitario }]

  if (body.notas_dueno !== undefined) {
    await supabase
      .from('cotizaciones')
      .update({ notas_dueno: body.notas_dueno })
      .eq('id', id)
      .eq('ferreteria_id', session.ferreteriaId)
  }

  if (Array.isArray(body.items)) {
    for (const item of body.items) {
      if (!item.id || item.precio_unitario === undefined) continue
      const precio = parseFloat(item.precio_unitario)
      if (isNaN(precio) || precio < 0) continue

      // Recalcular subtotal
      const { data: itemActual } = await supabase
        .from('items_cotizacion').select('cantidad').eq('id', item.id).single()
      if (!itemActual) continue

      await supabase
        .from('items_cotizacion')
        .update({
          precio_unitario: precio,
          subtotal: precio * itemActual.cantidad,
        })
        .eq('id', item.id)
    }
  }

  const { data } = await supabase
    .from('cotizaciones')
    .select('*, items_cotizacion(*)')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  return NextResponse.json(data)
}

// GET /api/cotizaciones/[id]
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { id } = await params
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('*, clientes(nombre, telefono), items_cotizacion(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}
