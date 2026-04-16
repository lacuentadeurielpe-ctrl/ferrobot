// GET  /api/empleados — lista empleados de la ferretería
// POST /api/empleados — crea usuario Auth + entrada en miembros_ferreteria

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionInfo } from '@/lib/auth/roles'
import { checkPermiso, PLANTILLAS, normalizarPermisos, type PlantillaPermiso } from '@/lib/auth/permisos'

export async function GET() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'gestionar_empleados')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('miembros_ferreteria')
    .select('id, user_id, nombre, email, rol, activo, permisos, created_at')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!checkPermiso(session, 'gestionar_empleados')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const body = await request.json()
  const { nombre, email, password, plantilla = 'atiende_tienda' } = body as {
    nombre: string
    email: string
    password: string
    plantilla: PlantillaPermiso
  }

  if (!nombre?.trim() || !email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: 'Nombre, email y contraseña son obligatorios' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true, // sin necesidad de verificar email
    user_metadata: { nombre: nombre.trim() },
  })

  if (authError) {
    const msg = authError.message.includes('already registered')
      ? 'Ya existe una cuenta con ese correo'
      : authError.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const userId = authData.user.id
  const permisos = normalizarPermisos(PLANTILLAS[plantilla] ?? PLANTILLAS.atiende_tienda)

  // 2. Crear entrada en miembros_ferreteria
  const { data: miembro, error: miembroError } = await admin
    .from('miembros_ferreteria')
    .insert({
      ferreteria_id: session.ferreteriaId,
      user_id: userId,
      rol: 'vendedor',
      nombre: nombre.trim(),
      email: email.trim().toLowerCase(),
      activo: true,
      permisos,
      contrasena_temporal: password,
    })
    .select('id, user_id, nombre, email, rol, activo, permisos, created_at')
    .single()

  if (miembroError) {
    // Revertir: eliminar el usuario Auth recién creado
    await admin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: miembroError.message }, { status: 500 })
  }

  return NextResponse.json(miembro, { status: 201 })
}
