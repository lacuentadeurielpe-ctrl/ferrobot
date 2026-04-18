/**
 * PATCH /api/superadmin/planes/[id] — editar un plan
 * DELETE /api/superadmin/planes/[id] — desactivar un plan
 */
import { NextResponse, type NextRequest } from 'next/server'
import { requireSuperadminAdmin } from '@/lib/auth/superadmin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperadminAdmin(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const body   = await request.json()

  const allowed = ['nombre', 'creditos_mes', 'precio_mensual', 'precio_exceso', 'activo']
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) update[key] = body[key]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('planes')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperadminAdmin(request)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const admin  = createAdminClient()

  // Verificar que no haya suscripciones activas en este plan
  const { count } = await admin
    .from('suscripciones')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', id)

  if (count && count > 0) {
    return NextResponse.json(
      { error: `No se puede eliminar: ${count} suscripciones activas en este plan` },
      { status: 409 }
    )
  }

  const { error } = await admin.from('planes').update({ activo: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
