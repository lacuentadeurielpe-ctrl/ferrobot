import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPin, pinValido } from '@/lib/pin'

export const dynamic = 'force-dynamic'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/delivery/[token]/pin
 * Verifica el PIN del repartidor identificado por su token de acceso.
 * No requiere sesión Supabase — la identidad es el token.
 *
 * Body: { pin: string }
 * Returns: { valido: boolean, sin_pin?: boolean }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await req.json().catch(() => ({}))
  const pin: string = body.pin ?? ''

  if (!pinValido(pin)) {
    return NextResponse.json({ valido: false })
  }

  const supabase = adminClient()

  const { data: rep } = await supabase
    .from('repartidores')
    .select('id, pin_hash, activo')
    .eq('token', token)
    .single()

  if (!rep || !rep.activo) {
    return NextResponse.json({ valido: false })
  }

  if (!rep.pin_hash) {
    return NextResponse.json({ valido: false, sin_pin: true })
  }

  const valido = verifyPin(pin, rep.pin_hash)
  return NextResponse.json({ valido })
}
