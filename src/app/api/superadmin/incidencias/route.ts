// GET   /api/superadmin/incidencias — listado de incidencias (todas o sin resolver)
// PATCH /api/superadmin/incidencias/[id] sería el siguiente paso, pero lo manejamos aquí
//       con ?id=xxx&accion=resolver en el body

import { NextResponse } from 'next/server'
import { verificarSuperadminAPI, requireSuperadminAdmin } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/superadmin/incidencias?resuelto=false&ferreteria_id=xxx
export async function GET(request: Request) {
  const session = await verificarSuperadminAPI(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const soloAbiertas = searchParams.get('resuelto') !== 'true'
  const ferreteriaId = searchParams.get('ferreteria_id')

  const admin = createAdminClient()

  let query = admin
    .from('incidencias_sistema')
    .select(`
      id, tipo, detalle, resuelto, resuelto_at, created_at,
      ferreteria_id,
      ferreterias (nombre)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (soloAbiertas) {
    query = query.eq('resuelto', false)
  }
  if (ferreteriaId) {
    query = query.eq('ferreteria_id', ferreteriaId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

// PATCH /api/superadmin/incidencias — resolver una o varias incidencias
// Body: { ids: string[] } o { ferreteria_id: string, tipos: string[] }
export async function PATCH(request: Request) {
  const session = await requireSuperadminAdmin(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const body = await request.json()
  const admin = createAdminClient()
  const ahora = new Date().toISOString()

  if (body.ids?.length) {
    const { error } = await admin
      .from('incidencias_sistema')
      .update({ resuelto: true, resuelto_at: ahora })
      .in('id', body.ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else if (body.ferreteria_id && body.tipos?.length) {
    const { error } = await admin
      .from('incidencias_sistema')
      .update({ resuelto: true, resuelto_at: ahora })
      .eq('ferreteria_id', body.ferreteria_id)
      .in('tipo', body.tipos)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    return NextResponse.json({ error: 'Debe especificar ids o ferreteria_id+tipos' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
