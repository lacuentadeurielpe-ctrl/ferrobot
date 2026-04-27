// PATCH /api/empleados/[id] — actualiza permisos, activo o resetea contraseña
// DELETE /api/empleados/[id] — elimina el empleado (desactiva cuenta Auth)

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionInfo } from '@/lib/auth/roles'
import { checkPermiso, normalizarPermisos, type PermisoMap } from '@/lib/auth/permisos'
import { logAccion } from '@/lib/audit'

interface Props {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'gestionar_empleados')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const body = await request.json()
  const admin = createAdminClient()

  // Verificar que el empleado pertenece a esta ferretería
  const { data: miembro } = await admin
    .from('miembros_ferreteria')
    .select('id, user_id, ferreteria_id')
    .eq('id', id)
    .single()

  if (!miembro || miembro.ferreteria_id !== session.ferreteriaId) {
    return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
  }

  const update: Record<string, unknown> = {}

  // Cambiar estado activo
  if (typeof body.activo === 'boolean') {
    update.activo = body.activo
  }

  // Actualizar permisos individuales o mapa completo
  if (body.permisos && typeof body.permisos === 'object') {
    update.permisos = normalizarPermisos(body.permisos as Partial<PermisoMap>)
  }

  // Resetear contraseña
  if (body.nueva_password) {
    if (String(body.nueva_password).length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
    }
    const { error: pwError } = await admin.auth.admin.updateUserById(miembro.user_id, {
      password: body.nueva_password,
    })
    if (pwError) return NextResponse.json({ error: pwError.message }, { status: 500 })
    update.contrasena_temporal = body.nueva_password
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Sin campos para actualizar' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('miembros_ferreteria')
    .update(update)
    .eq('id', id)
    .select('id, user_id, nombre, email, rol, activo, permisos, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auditoría según qué campo se actualizó
  if (typeof body.activo === 'boolean') {
    await logAccion({
      ferreteriaId: session.ferreteriaId,
      usuarioId:    session.userId,
      accion:       body.activo ? 'activar_empleado' : 'desactivar_empleado',
      entidad:      'empleado',
      entidadId:    id,
      detalle:      { nombre: data.nombre, email: data.email },
    })
  } else if (body.permisos) {
    await logAccion({
      ferreteriaId: session.ferreteriaId,
      usuarioId:    session.userId,
      accion:       'cambiar_permisos_empleado',
      entidad:      'empleado',
      entidadId:    id,
      detalle:      { nombre: data.nombre },
    })
  } else if (body.nueva_password) {
    await logAccion({
      ferreteriaId: session.ferreteriaId,
      usuarioId:    session.userId,
      accion:       'reset_password_empleado',
      entidad:      'empleado',
      entidadId:    id,
      detalle:      { nombre: data.nombre },
    })
  }

  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: Props) {
  const { id } = await params
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'gestionar_empleados')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: miembro } = await admin
    .from('miembros_ferreteria')
    .select('id, user_id, ferreteria_id')
    .eq('id', id)
    .single()

  if (!miembro || miembro.ferreteria_id !== session.ferreteriaId) {
    return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
  }

  // Eliminar de miembros_ferreteria y desactivar cuenta Auth
  const { error } = await admin
    .from('miembros_ferreteria')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Desactivar usuario en Auth (no eliminar para preservar historial)
  await admin.auth.admin.updateUserById(miembro.user_id, {
    ban_duration: '876600h', // ~100 años
  })

  await logAccion({
    ferreteriaId: session.ferreteriaId,
    usuarioId:    session.userId,
    accion:       'eliminar_empleado',
    entidad:      'empleado',
    entidadId:    id,
    detalle:      { user_id: miembro.user_id },
  })

  return NextResponse.json({ ok: true })
}
