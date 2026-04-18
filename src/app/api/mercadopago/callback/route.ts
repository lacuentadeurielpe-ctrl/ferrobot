/**
 * GET /api/mercadopago/callback
 *
 * Callback OAuth de Mercado Pago — ruta PÚBLICA (en RUTAS_PUBLICAS del proxy).
 *
 * MP redirige aquí con ?code=...&state=...
 * 1. Verifica que el state coincide con la cookie mp_oauth_state
 * 2. Extrae ferreteriaId del state
 * 3. Intercambia el code por tokens
 * 4. Guarda tokens encriptados en configuracion_mercadopago
 * 5. Redirige a /dashboard/settings con mensaje de éxito o error
 */

import { NextResponse, type NextRequest } from 'next/server'
import { intercambiarCodigo, guardarConfiguracionMP } from '@/lib/mercadopago'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code    = searchParams.get('code')
  const state   = searchParams.get('state')
  const errorMp = searchParams.get('error')

  const settingsUrl = new URL('/dashboard/settings', request.url)

  // MP puede redirigir con error si el usuario rechaza
  if (errorMp) {
    settingsUrl.searchParams.set('mp_error', 'cancelado')
    const response = NextResponse.redirect(settingsUrl)
    response.cookies.delete('mp_oauth_state')
    return response
  }

  if (!code || !state) {
    settingsUrl.searchParams.set('mp_error', 'parametros_invalidos')
    const response = NextResponse.redirect(settingsUrl)
    response.cookies.delete('mp_oauth_state')
    return response
  }

  // Verificar state contra cookie
  const cookieState = request.cookies.get('mp_oauth_state')?.value
  if (!cookieState || cookieState !== state) {
    settingsUrl.searchParams.set('mp_error', 'state_invalido')
    const response = NextResponse.redirect(settingsUrl)
    response.cookies.delete('mp_oauth_state')
    return response
  }

  // Decodificar ferreteriaId del state
  let ferreteriaId: string
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf-8')
    const [fid]   = decoded.split('|')
    if (!fid) throw new Error('ferreteriaId vacío')
    ferreteriaId = fid
  } catch {
    settingsUrl.searchParams.set('mp_error', 'state_invalido')
    const response = NextResponse.redirect(settingsUrl)
    response.cookies.delete('mp_oauth_state')
    return response
  }

  // Intercambiar code por tokens
  try {
    const tokens = await intercambiarCodigo(code)
    await guardarConfiguracionMP(ferreteriaId, tokens)
    settingsUrl.searchParams.set('mp_ok', '1')
  } catch (err) {
    console.error('[MP OAuth callback]', err)
    settingsUrl.searchParams.set('mp_error', 'token_exchange')
  }

  const response = NextResponse.redirect(settingsUrl)
  response.cookies.delete('mp_oauth_state')
  return response
}
