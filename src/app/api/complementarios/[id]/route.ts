// DELETE /api/complementarios/[id] — desactiva un par manual
// PATCH  /api/complementarios/[id] — activa/desactiva (toggle)
// FERRETERÍA AISLADA: siempre filtra por ferreteriaId de la sesión

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const supabase = await createClient()
  if (session.rol !== 'dueno') return NextResponse.json({ error: 'Solo el dueño puede gestionar complementarios' }, { status: 403 })

  const { id } = await params

  const { error } = await supabase
    .from('productos_complementarios')
    .delete()
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)  // FERRETERÍA AISLADA

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const supabase = await createClient()
  if (session.rol !== 'dueno') return NextResponse.json({ error: 'Solo el dueño puede gestionar complementarios' }, { status: 403 })

  const { id } = await params
  const { activo } = await request.json()

  const { error } = await supabase
    .from('productos_complementarios')
    .update({ activo })
    .eq('id', id)
    .eq('ferreteria_id', session.ferreteriaId)  // FERRETERÍA AISLADA

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
