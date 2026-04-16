// POST /api/pedidos/[id]/pago — gestionar método y estado de pago
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

  const { id } = await params
  const body = await request.json()
  const supabase = await createClient()

  // Verificar que el pedido pertenece a la ferretería
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, estado_pago, metodo_pago, estado')
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  // No permitir cambios de pago en pedidos cancelados
  if (pedido.estado === 'cancelado') {
    return NextResponse.json({ error: 'No se puede modificar el pago de un pedido cancelado' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  // Cambiar método de pago
  if (body.metodo_pago !== undefined) {
    const METODOS_VALIDOS = ['efectivo', 'yape', 'transferencia', 'tarjeta', 'credito']
    if (!METODOS_VALIDOS.includes(body.metodo_pago)) {
      return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 })
    }
    update.metodo_pago = body.metodo_pago
    // Si se cambia a efectivo, resetear estado a pendiente
    if (body.metodo_pago === 'efectivo' && pedido.estado_pago !== 'pagado') {
      update.estado_pago = 'pendiente'
    }
  }

  // Cambiar estado de pago
  if (body.estado_pago !== undefined) {
    const nuevoEstado = body.estado_pago
    const ESTADOS_PAGO_VALIDOS = ['pendiente', 'verificando', 'pagado', 'credito_activo', 'credito_vencido', 'reembolso_pendiente']

    if (!ESTADOS_PAGO_VALIDOS.includes(nuevoEstado)) {
      return NextResponse.json({ error: 'Estado de pago inválido' }, { status: 400 })
    }

    // Confirmar pago (pagado / credito_activo) requiere permiso
    if (['pagado', 'credito_activo'].includes(nuevoEstado)) {
      if (!checkPermiso(session, 'registrar_pagos')) {
        return NextResponse.json({ error: 'Sin permiso para confirmar pagos' }, { status: 403 })
      }
      update.pago_confirmado_por = session.userId
      update.pago_confirmado_at = new Date().toISOString()
    }

    update.estado_pago = nuevoEstado
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('pedidos')
    .update(update)
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .select('id, estado_pago, metodo_pago, pago_confirmado_por, pago_confirmado_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
