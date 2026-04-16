// GET  /api/rendiciones — lista rendiciones de la ferretería
// POST /api/rendiciones — crear rendición del día para un repartidor
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { checkPermiso } from '@/lib/auth/permisos'

export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'ver_caja_dia')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('rendiciones')
    .select(`
      *,
      repartidores(id, nombre, telefono)
    `)
    .eq('ferreteria_id', session.ferreteriaId)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'ver_caja_dia')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()
  const { repartidor_id, fecha } = body
  if (!repartidor_id) return NextResponse.json({ error: 'repartidor_id requerido' }, { status: 400 })

  const fechaDia = fecha ?? new Date().toISOString().slice(0, 10)
  const supabase = await createClient()

  // Verify repartidor belongs to this ferretería
  const { data: rep } = await supabase
    .from('repartidores')
    .select('id, nombre')
    .eq('id', repartidor_id)
    .eq('ferreteria_id', session.ferreteriaId)
    .single()

  if (!rep) return NextResponse.json({ error: 'Repartidor no encontrado' }, { status: 404 })

  // Sum up cobrado_monto from entregado pedidos for this repartidor on this day
  const { data: pedidosDia } = await supabase
    .from('pedidos')
    .select('total, cobrado_monto')
    .eq('ferreteria_id', session.ferreteriaId)
    .eq('repartidor_id', repartidor_id)
    .eq('estado', 'entregado')
    .gte('created_at', `${fechaDia}T00:00:00`)
    .lt('created_at', `${fechaDia}T23:59:59`)

  const monto_esperado = pedidosDia?.reduce((s, p) => s + (p.total ?? 0), 0) ?? 0
  const monto_recibido = pedidosDia?.reduce((s, p) => s + (p.cobrado_monto ?? 0), 0) ?? 0
  const diferencia = monto_recibido - monto_esperado

  const { data, error } = await supabase
    .from('rendiciones')
    .insert({
      ferreteria_id: session.ferreteriaId,
      repartidor_id,
      fecha: fechaDia,
      monto_esperado,
      monto_recibido,
      diferencia,
    })
    .select('*, repartidores(id, nombre)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
