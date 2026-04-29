import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

// GET /api/entregas — entregas activas de la ferretería
export async function GET(req: NextRequest) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado')

  let query = supabase
    .from('entregas')
    .select(`
      id, estado, eta_inicial, eta_actual, orden_en_ruta,
      salio_at, llego_at, distancia_km, duracion_estimada_min, duracion_real_min,
      pedidos(id, numero_pedido, nombre_cliente, telefono_cliente, direccion_entrega, total, eta_minutos, estado),
      vehiculos(id, nombre, tipo),
      repartidores(id, nombre)
    `)
    .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
    .order('created_at', { ascending: false })

  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
