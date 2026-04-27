// PATCH /api/repartidores/[id] — edita o desactiva un repartidor
// DELETE /api/repartidores/[id] — elimina un repartidor
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
  if (!checkPermiso(session, 'configurar_ferreteria')) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const body = await request.json()
  const supabase = await createClient()

  const update: Record<string, unknown> = {}
  if (body.nombre                !== undefined) update.nombre                = body.nombre.trim()
  if (body.telefono              !== undefined) update.telefono              = body.telefono?.trim() ?? null
  if (body.activo                !== undefined) update.activo                = body.activo
  if (body.puede_registrar_deuda !== undefined) update.puede_registrar_deuda = body.puede_registrar_deuda

  const { data, error } = await supabase
    .from('repartidores')
    .update(update)
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)   // TENANT AISLADO
    .select('id, nombre, telefono, activo, token, puede_registrar_deuda')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
