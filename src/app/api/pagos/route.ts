// GET  /api/pagos — listado de pagos registrados (dashboard)
// FERRETERÍA AISLADA: filtra siempre por ferreteriaId de la sesión

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

export async function GET(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const estado  = searchParams.get('estado')   // filtro opcional
  const limit   = Math.min(Number(searchParams.get('limit') ?? '50'), 200)
  const offset  = Number(searchParams.get('offset') ?? '0')

  let query = supabase
    .from('pagos_registrados')
    .select(`
      id, metodo, monto, moneda, numero_operacion, nombre_pagador,
      ultimos_digitos, fecha_pago, banco_origen, estado, url_captura,
      confianza_extraccion, notas, registrado_at,
      cliente:clientes(id, nombre, telefono),
      pedido:pedidos(id, numero_pedido, total)
    `, { count: 'exact' })
    .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
    .order('registrado_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (estado) query = query.eq('estado', estado)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ pagos: data ?? [], total: count ?? 0 })
}
