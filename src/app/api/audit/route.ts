import { NextRequest, NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET /api/audit?limit=50&offset=0&accion=xxx&entidad=xxx
 *  Devuelve el historial de acciones auditadas de la ferretería del usuario. */
export async function GET(req: NextRequest) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const limit   = Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 200)
  const offset  = Math.max(parseInt(searchParams.get('offset') ?? '0',  10), 0)
  const accion  = searchParams.get('accion')  ?? null
  const entidad = searchParams.get('entidad') ?? null

  const supabase = await createClient()

  let query = supabase
    .from('acciones_auditadas')
    .select('id, usuario_nombre, accion, entidad, entidad_id, detalle, created_at', { count: 'exact' })
    .eq('ferreteria_id', session.ferreteriaId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (accion)  query = query.eq('accion', accion)
  if (entidad) query = query.eq('entidad', entidad)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, total: count ?? 0 })
}
