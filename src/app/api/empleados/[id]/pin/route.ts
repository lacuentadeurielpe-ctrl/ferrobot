import { NextRequest, NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPin, verifyPin, pinValido } from '@/lib/pin'
import { logAccion } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** POST /api/empleados/[id]/pin — establece o actualiza el PIN de un empleado */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  // Solo el dueño puede establecer PINs
  if (session.rol !== 'dueno') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const pin: string = body.pin ?? ''

  if (!pinValido(pin)) {
    return NextResponse.json({ error: 'El PIN debe ser exactamente 4 dígitos numéricos' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verificar que el miembro pertenece a la ferretería del dueño
  const { data: miembro } = await admin
    .from('miembros_ferreteria')
    .select('id, ferreteria_id, nombre')
    .eq('id', id)
    .single()

  if (!miembro || miembro.ferreteria_id !== session.ferreteriaId) {
    return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })
  }

  const pin_hash = hashPin(pin)

  const { error } = await admin
    .from('miembros_ferreteria')
    .update({ pin_hash })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAccion({
    ferreteriaId:  session.ferreteriaId,
    usuarioId:     session.userId,
    usuarioNombre: session.nombreFerreteria ?? null,
    accion:        'set_pin_empleado',
    entidad:       'empleado',
    entidadId:     id,
    detalle:       { nombre_empleado: miembro.nombre },
  })

  return NextResponse.json({ ok: true })
}

/** PUT /api/empleados/[id]/pin — verifica el PIN (usado por el empleado para confirmar acciones sensibles) */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const pin: string = body.pin ?? ''

  if (!pinValido(pin)) {
    return NextResponse.json({ valido: false }, { status: 200 })
  }

  const admin = createAdminClient()

  // El empleado solo puede verificar su propio PIN; el dueño puede verificar cualquiera
  const { data: miembro } = await admin
    .from('miembros_ferreteria')
    .select('id, ferreteria_id, user_id, pin_hash')
    .eq('id', id)
    .single()

  if (!miembro || miembro.ferreteria_id !== session.ferreteriaId) {
    return NextResponse.json({ valido: false })
  }

  // Un vendedor solo puede verificar su propio PIN
  if (session.rol === 'vendedor' && miembro.user_id !== session.userId) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  if (!miembro.pin_hash) {
    return NextResponse.json({ valido: false, sin_pin: true })
  }

  const valido = verifyPin(pin, miembro.pin_hash)
  return NextResponse.json({ valido })
}
