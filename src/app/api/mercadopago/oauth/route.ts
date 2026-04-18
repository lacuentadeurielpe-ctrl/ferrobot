/**
 * GET /api/mercadopago/oauth
 *
 * Inicia el flujo OAuth de Mercado Pago.
 * - Requiere sesión de usuario (dueño de ferretería)
 * - Genera un state aleatorio firmado, lo guarda en cookie httpOnly
 * - Redirige a la página de autorización de MP
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generarUrlAutorizacion, mpConfigurado } from '@/lib/mercadopago'

export async function GET(request: NextRequest) {
  // Verificar que las credenciales MP están configuradas
  if (!mpConfigurado()) {
    return NextResponse.json(
      { error: 'Mercado Pago no está configurado en el servidor' },
      { status: 503 }
    )
  }

  // Verificar sesión de usuario
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Obtener ferreteriaId del usuario
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!ferreteria) {
    return NextResponse.json({ error: 'Ferretería no encontrada' }, { status: 404 })
  }

  // Generar state: ferreteriaId + nonce aleatorio en base64url
  const nonce = crypto.getRandomValues(new Uint8Array(16))
  const nonceHex = Array.from(nonce).map((b) => b.toString(16).padStart(2, '0')).join('')
  const state = Buffer.from(`${ferreteria.id}|${nonceHex}`).toString('base64url')

  // URL de autorización de MP
  const mpAuthUrl = generarUrlAutorizacion(state)

  // Guardar state en cookie httpOnly (expira en 15 minutos)
  const response = NextResponse.redirect(mpAuthUrl)
  response.cookies.set('mp_oauth_state', state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 15, // 15 minutos
    path:     '/',
  })

  return response
}
