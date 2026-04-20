// PATCH /api/pagos/[id] — aprobar, rechazar o vincular pago a pedido
// Solo el dueño puede gestionar pagos.
// FERRETERÍA AISLADA: filtra por ferreteriaId de la sesión.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (session.rol !== 'dueno') return NextResponse.json({ error: 'Solo el dueño puede gestionar pagos' }, { status: 403 })

  const supabase = await createClient()
  const { id } = await params
  const body = await request.json() as {
    accion: 'aprobar' | 'rechazar' | 'vincular'
    pedido_id?: string
    notas?: string
  }

  // Verificar que el pago pertenece a esta ferretería — FERRETERÍA AISLADA
  const { data: pago } = await supabase
    .from('pagos_registrados')
    .select('id, estado, monto, pedido_id')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
    .single()

  if (!pago) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })

  const ahora = new Date().toISOString()

  if (body.accion === 'aprobar') {
    // Marcar pago como confirmado y actualizar pedido si está vinculado
    const { error } = await supabase
      .from('pagos_registrados')
      .update({
        estado: 'confirmado_auto',
        notas: body.notas ?? 'Aprobado manualmente por el dueño',
        updated_at: ahora,
      })
      .eq('id', id)
      .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Si hay pedido vinculado, marcarlo como pagado
    const pedidoId = body.pedido_id ?? pago.pedido_id
    if (pedidoId) {
      await supabase
        .from('pedidos')
        .update({ estado_pago: 'pagado', monto_pagado: pago.monto })
        .eq('id', pedidoId)
        .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
    }

    return NextResponse.json({ ok: true })
  }

  if (body.accion === 'rechazar') {
    const { error } = await supabase
      .from('pagos_registrados')
      .update({
        estado: 'rechazado',
        notas: body.notas ?? 'Rechazado por el dueño',
        updated_at: ahora,
      })
      .eq('id', id)
      .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.accion === 'vincular') {
    if (!body.pedido_id) return NextResponse.json({ error: 'pedido_id requerido' }, { status: 400 })

    // Verificar que el pedido pertenece a esta ferretería — FERRETERÍA AISLADA
    const { data: pedido } = await supabase
      .from('pedidos')
      .select('id, total')
      .eq('id', body.pedido_id)
      .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
      .single()

    if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

    const { error } = await supabase
      .from('pagos_registrados')
      .update({
        pedido_id: body.pedido_id,
        estado: 'confirmado_auto',
        notas: body.notas ?? `Vinculado manualmente al pedido ${body.pedido_id}`,
        updated_at: ahora,
      })
      .eq('id', id)
      .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Marcar pedido como pagado
    await supabase
      .from('pedidos')
      .update({ estado_pago: 'pagado', monto_pagado: pago.monto })
      .eq('id', body.pedido_id)
      .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
}
