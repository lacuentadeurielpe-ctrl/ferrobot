// POST /api/creditos/[id]/abonar — registrar un abono a un crédito
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { checkPermiso } from '@/lib/auth/permisos'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'registrar_abonos')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const { monto, metodo_pago, notas } = body

  if (!monto || Number(monto) <= 0) return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })

  const supabase = await createClient()

  // Verificar crédito y pertenencia a la ferretería
  const { data: credito } = await supabase
    .from('creditos')
    .select('id, monto_total, monto_pagado, estado, ferreteria_id')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (!credito) return NextResponse.json({ error: 'Crédito no encontrado' }, { status: 404 })
  if (credito.estado === 'pagado') return NextResponse.json({ error: 'Este crédito ya está cancelado' }, { status: 400 })

  const montoAbono = Number(monto)
  const saldoActual = credito.monto_total - credito.monto_pagado
  const montoReal = Math.min(montoAbono, saldoActual) // no abonar más del saldo

  // Insertar abono
  const { data: abono, error: errAbono } = await supabase
    .from('abonos_credito')
    .insert({
      credito_id: id,
      monto: montoReal,
      metodo_pago: metodo_pago ?? null,
      notas: notas ?? null,
      registrado_por: session.userId,
    })
    .select('*')
    .single()

  if (errAbono) return NextResponse.json({ error: errAbono.message }, { status: 500 })

  const nuevoMontoPagado = credito.monto_pagado + montoReal
  const pagadoCompleto = nuevoMontoPagado >= credito.monto_total

  // Actualizar monto_pagado y estado del crédito
  await supabase
    .from('creditos')
    .update({
      monto_pagado: nuevoMontoPagado,
      estado: pagadoCompleto ? 'pagado' : credito.estado,
    })
    .eq('id', id)

  // Si se pagó completo, actualizar también el pedido
  if (pagadoCompleto) {
    const { data: creditoConPedido } = await supabase
      .from('creditos')
      .select('pedido_id')
      .eq('id', id)
      .single()

    if (creditoConPedido?.pedido_id) {
      await supabase
        .from('pedidos')
        .update({
          estado_pago: 'pagado',
          pago_confirmado_por: session.userId,
          pago_confirmado_at: new Date().toISOString(),
        })
        .eq('id', creditoConPedido.pedido_id)
        .eq('ferreteria_id', session.ferreteriaId)
    }
  }

  return NextResponse.json({
    abono,
    nuevo_monto_pagado: nuevoMontoPagado,
    nuevo_estado: pagadoCompleto ? 'pagado' : credito.estado,
    saldo_restante: Math.max(0, credito.monto_total - nuevoMontoPagado),
  })
}
