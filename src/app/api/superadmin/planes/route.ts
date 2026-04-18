/**
 * GET  /api/superadmin/planes — lista todos los planes
 * POST /api/superadmin/planes — crea un nuevo plan
 */
import { NextResponse, type NextRequest } from 'next/server'
import { verificarSuperadminAPI, requireSuperadminAdmin } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const session = await verificarSuperadminAPI(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('planes')
    .select('*')
    .order('precio_mensual', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const session = await requireSuperadminAdmin(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await request.json()
  const { nombre, creditos_mes, precio_mensual, precio_exceso } = body

  if (!nombre || !creditos_mes || precio_mensual === undefined) {
    return NextResponse.json({ error: 'nombre, creditos_mes y precio_mensual son requeridos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('planes')
    .insert({ nombre, creditos_mes: Number(creditos_mes), precio_mensual: Number(precio_mensual), precio_exceso: Number(precio_exceso ?? 0) })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
