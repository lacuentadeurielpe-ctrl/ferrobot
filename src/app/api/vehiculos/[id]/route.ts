import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

// PATCH /api/vehiculos/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const body   = await req.json().catch(() => ({}))

  // Campos editables — no permitir cambiar ferreteria_id
  const {
    nombre, tipo, capacidad_kg, capacidad_m3,
    velocidad_promedio_kmh, costo_por_km, activo,
  } = body

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vehiculos')
    .update({
      ...(nombre                 !== undefined && { nombre: nombre.trim() }),
      ...(tipo                   !== undefined && { tipo }),
      ...(capacidad_kg           !== undefined && { capacidad_kg }),
      ...(capacidad_m3           !== undefined && { capacidad_m3 }),
      ...(velocidad_promedio_kmh !== undefined && { velocidad_promedio_kmh }),
      ...(costo_por_km           !== undefined && { costo_por_km }),
      ...(activo                 !== undefined && { activo }),
    })
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)   // ferretería aislada
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  return NextResponse.json(data)
}

// DELETE /api/vehiculos/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params

  const supabase = await createClient()

  // Verificar que no tenga entregas activas
  const { count } = await supabase
    .from('entregas')
    .select('id', { count: 'exact', head: true })
    .eq('vehiculo_id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .in('estado', ['pendiente', 'carga', 'en_ruta'])

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'No se puede eliminar — el vehículo tiene entregas activas' },
      { status: 409 },
    )
  }

  const { error } = await supabase
    .from('vehiculos')
    .delete()
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)   // ferretería aislada

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
