import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/cotizaciones/[id] — actualizar precios de items (antes de aprobar)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
  // body.items = [{ id, precio_unitario }]

  if (body.notas_dueno !== undefined) {
    await supabase
      .from('cotizaciones')
      .update({ notas_dueno: body.notas_dueno })
      .eq('id', id)
      .eq('ferreteria_id', ferreteria.id)
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
    .eq('ferreteria_id', ferreteria.id)
    .single()

  return NextResponse.json(data)
}

// GET /api/cotizaciones/[id]
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('*, clientes(nombre, telefono), items_cotizacion(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}
