// GET  /api/creditos — lista créditos de la ferretería
// POST /api/creditos — crear crédito para un pedido
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { checkPermiso } from '@/lib/auth/permisos'

export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'ver_creditos')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const supabase = await createClient()

  // Marcar automáticamente como vencidos los que pasaron fecha_limite
  // y sincronizar pedidos.estado_pago → 'credito_vencido' para visibilidad universal
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: creditosAVencer } = await supabase
    .from('creditos')
    .select('id, pedido_id')
    .eq('ferreteria_id', session.ferreteriaId)
    .eq('estado', 'activo')
    .lt('fecha_limite', hoy)

  if (creditosAVencer && creditosAVencer.length > 0) {
    await supabase
      .from('creditos')
      .update({ estado: 'vencido' })
      .in('id', creditosAVencer.map(c => c.id))

    const pedidoIds = creditosAVencer
      .filter(c => c.pedido_id)
      .map(c => c.pedido_id as string)

    if (pedidoIds.length > 0) {
      await supabase
        .from('pedidos')
        .update({ estado_pago: 'credito_vencido' })
        .in('id', pedidoIds)
        .eq('ferreteria_id', session.ferreteriaId)
        .eq('estado_pago', 'credito_activo')   // solo si sigue como deuda activa
    }
  }

  const { data, error } = await supabase
    .from('creditos')
    .select(`
      *,
      clientes(id, nombre, telefono),
      pedidos(id, numero_pedido, total),
      abonos_credito(id, monto, metodo_pago, notas, registrado_por, created_at)
    `)
    .eq('ferreteria_id', session.ferreteriaId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'aprobar_creditos')) return NextResponse.json({ error: 'Sin permiso para aprobar créditos' }, { status: 403 })

  const body = await request.json()
  const { pedido_id, fecha_limite, notas } = body

  if (!pedido_id) return NextResponse.json({ error: 'pedido_id requerido' }, { status: 400 })
  if (!fecha_limite) return NextResponse.json({ error: 'fecha_limite requerido' }, { status: 400 })

  const supabase = await createClient()

  // Verificar que el pedido pertenece a esta ferretería y tiene metodo_pago='credito'
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, total, cliente_id, metodo_pago, estado_pago')
    .eq('id', pedido_id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  if (pedido.metodo_pago !== 'credito') return NextResponse.json({ error: 'El pedido no tiene método de pago crédito' }, { status: 400 })
  if (pedido.estado_pago === 'credito_activo') return NextResponse.json({ error: 'Este pedido ya tiene un crédito activo' }, { status: 400 })

  // Crear el crédito
  const { data: credito, error: errCredito } = await supabase
    .from('creditos')
    .insert({
      ferreteria_id: session.ferreteriaId,
      cliente_id: pedido.cliente_id,
      pedido_id,
      monto_total: pedido.total,
      monto_pagado: 0,
      fecha_limite,
      estado: 'activo',
      aprobado_por: session.userId,
      notas: notas ?? null,
    })
    .select('*')
    .single()

  if (errCredito) return NextResponse.json({ error: errCredito.message }, { status: 500 })

  // Actualizar el estado_pago del pedido a credito_activo
  await supabase
    .from('pedidos')
    .update({
      estado_pago: 'credito_activo',
      pago_confirmado_por: session.userId,
      pago_confirmado_at: new Date().toISOString(),
    })
    .eq('id', pedido_id)
    .eq('ferreteria_id', session.ferreteriaId)

  return NextResponse.json(credito, { status: 201 })
}
