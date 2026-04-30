import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { recalcularETAsCola } from '@/lib/delivery/assignment'

export const dynamic = 'force-dynamic'

// PATCH /api/entregas/[id] — actualizar estado, vehículo o repartidor (desde dashboard)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { estado, vehiculo_id, repartidor_id } = body as {
    estado?: string
    vehiculo_id?: string | null
    repartidor_id?: string | null
  }

  const supabase = await createClient()

  const update: Record<string, unknown> = {}
  if (estado       !== undefined) update.estado       = estado
  if (vehiculo_id  !== undefined) update.vehiculo_id  = vehiculo_id
  if (repartidor_id !== undefined) update.repartidor_id = repartidor_id

  // Timestamps automáticos según transición de estado
  if (estado === 'en_ruta')   update.salio_at = new Date().toISOString()
  if (estado === 'entregado') update.llego_at = new Date().toISOString()

  // Calcular duración real si llegó a entregado
  if (estado === 'entregado') {
    const { data: entregaActual } = await supabase
      .from('entregas')
      .select('salio_at')
      .eq('id', id)
      .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
      .single()

    if (entregaActual?.salio_at) {
      update.duracion_real_min = Math.round(
        (Date.now() - new Date(entregaActual.salio_at).getTime()) / 60_000,
      )
    }
  }

  const { data, error } = await supabase
    .from('entregas')
    .update(update)
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Si la entrega se completó o falló, recalcular ETAs del resto de la cola
  if (estado === 'entregado' || estado === 'fallida') {
    recalcularETAsCola(session.ferreteriaId, supabase)
      .catch((e) => console.error('[Entregas] recalcularETAsCola error:', e))
  }

  return NextResponse.json(data)
}
