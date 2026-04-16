// PATCH /api/team/[id] — activa o desactiva un miembro (solo dueno)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { checkPermiso } from '@/lib/auth/permisos'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'gestionar_empleados')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('miembros_ferreteria')
    .update({ activo: body.activo })
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)
    .select('id, nombre, activo')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
