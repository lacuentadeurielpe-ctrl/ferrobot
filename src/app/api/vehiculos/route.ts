import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

// GET /api/vehiculos — listar vehículos de la ferretería
export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vehiculos')
    .select('*')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('nombre')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/vehiculos — crear vehículo
export async function POST(req: NextRequest) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const {
    nombre,
    tipo            = 'moto',
    capacidad_kg    = 100,
    capacidad_m3    = 0.5,
    velocidad_promedio_kmh = 30,
    costo_por_km,
  } = body as {
    nombre?: string
    tipo?: string
    capacidad_kg?: number
    capacidad_m3?: number
    velocidad_promedio_kmh?: number
    costo_por_km?: number | null
  }

  if (!nombre?.trim()) {
    return NextResponse.json({ error: 'El nombre del vehículo es requerido' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vehiculos')
    .insert({
      ferreteria_id:          session.ferreteriaId,
      nombre:                 nombre.trim(),
      tipo,
      capacidad_kg,
      capacidad_m3,
      velocidad_promedio_kmh,
      costo_por_km:           costo_por_km ?? null,
      activo:                 true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
