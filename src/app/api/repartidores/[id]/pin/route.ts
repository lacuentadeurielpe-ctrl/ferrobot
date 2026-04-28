import { NextRequest, NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPin, pinValido } from '@/lib/pin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/repartidores/[id]/pin
 * Establece o actualiza el PIN de un repartidor.
 * Solo el dueño puede hacerlo.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (session.rol !== 'dueno') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const body   = await req.json().catch(() => ({}))
  const pin: string = body.pin ?? ''

  if (!pinValido(pin)) {
    return NextResponse.json(
      { error: 'El PIN debe ser exactamente 4 dígitos numéricos' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Verificar que el repartidor pertenece a la ferretería del dueño (aislamiento)
  const { data: rep } = await admin
    .from('repartidores')
    .select('id, ferreteria_id, nombre')
    .eq('id', id)
    .single()

  if (!rep || rep.ferreteria_id !== session.ferreteriaId) {
    return NextResponse.json({ error: 'Repartidor no encontrado' }, { status: 404 })
  }

  const pin_hash = hashPin(pin)
  const { error } = await admin
    .from('repartidores')
    .update({ pin_hash })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
