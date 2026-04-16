// GET /api/team — lista los miembros del equipo (solo dueno)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { checkPermiso } from '@/lib/auth/permisos'

export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'gestionar_empleados')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('miembros_ferreteria')
    .select('id, nombre, email, rol, activo, created_at')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
