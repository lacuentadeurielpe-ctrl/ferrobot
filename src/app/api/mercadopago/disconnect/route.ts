/**
 * POST /api/mercadopago/disconnect
 *
 * Desconecta la cuenta de Mercado Pago del tenant.
 * Requiere sesión de usuario (solo el dueño puede desconectar).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { desconectarMP } from '@/lib/mercadopago'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Solo el dueño puede desconectar (verificar ownership)
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!ferreteria) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    await desconectarMP(ferreteria.id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[MP disconnect]', err)
    return NextResponse.json({ error: 'Error al desconectar' }, { status: 500 })
  }
}
