/**
 * Mercado Pago OAuth — helpers por tenant.
 *
 * Cada ferretero conecta su propia cuenta MP desde Settings.
 * Los tokens se guardan encriptados en configuracion_mercadopago.
 *
 * Env vars requeridas:
 *   MP_CLIENT_ID      — Application ID de tu app MP
 *   MP_CLIENT_SECRET  — Client secret de tu app MP
 *   NEXT_PUBLIC_APP_URL — URL base de la app (para el redirect_uri)
 */

import { encriptar, desencriptar } from '@/lib/encryption'
import { createAdminClient } from '@/lib/supabase/admin'

const MP_AUTH_URL  = 'https://auth.mercadopago.com/authorization'
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token'

// ─── Helpers de configuración ──────────────────────────────────────────────

function getClientId(): string {
  const id = process.env.MP_CLIENT_ID
  if (!id) throw new Error('MP_CLIENT_ID no configurado')
  return id
}

function getClientSecret(): string {
  const secret = process.env.MP_CLIENT_SECRET
  if (!secret) throw new Error('MP_CLIENT_SECRET no configurado')
  return secret
}

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}/api/mercadopago/callback`
}

/** Verifica si las credenciales MP están configuradas en el servidor */
export function mpConfigurado(): boolean {
  return !!(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET)
}

// ─── OAuth flow ────────────────────────────────────────────────────────────

/**
 * Genera la URL de autorización de Mercado Pago.
 * El parámetro `state` se usa para verificar el callback y recuperar ferreteriaId.
 */
export function generarUrlAutorizacion(state: string): string {
  const params = new URLSearchParams({
    client_id:     getClientId(),
    response_type: 'code',
    platform_id:   'mp',
    state,
    redirect_uri:  getRedirectUri(),
  })
  return `${MP_AUTH_URL}?${params.toString()}`
}

export interface MPTokenResponse {
  access_token:  string
  token_type:    string
  expires_in:    number
  scope:         string
  refresh_token: string
  user_id:       number
  email?:        string
}

/**
 * Intercambia el código de autorización por access_token + refresh_token.
 */
export async function intercambiarCodigo(code: string): Promise<MPTokenResponse> {
  const res = await fetch(MP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     getClientId(),
      client_secret: getClientSecret(),
      code,
      redirect_uri:  getRedirectUri(),
      grant_type:    'authorization_code',
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`MP token exchange failed (${res.status}): ${error}`)
  }

  return res.json()
}

/**
 * Refresca el access_token usando el refresh_token.
 */
export async function refrescarToken(refreshToken: string): Promise<MPTokenResponse> {
  const res = await fetch(MP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`MP token refresh failed (${res.status}): ${error}`)
  }

  return res.json()
}

// ─── Persistencia en BD ────────────────────────────────────────────────────

/**
 * Guarda (o actualiza) la configuración MP de un tenant.
 * Encripta los tokens antes de escribir en BD.
 */
export async function guardarConfiguracionMP(
  ferreteriaId: string,
  tokens: MPTokenResponse
): Promise<void> {
  const admin = createAdminClient()

  const [accessEnc, refreshEnc] = await Promise.all([
    encriptar(tokens.access_token),
    encriptar(tokens.refresh_token),
  ])

  // expires_in viene en segundos desde ahora
  const expiraAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  const { error } = await admin
    .from('configuracion_mercadopago')
    .upsert(
      {
        ferreteria_id:    ferreteriaId,
        access_token_enc: accessEnc,
        refresh_token_enc: refreshEnc,
        mp_user_id:       String(tokens.user_id),
        mp_email:         tokens.email ?? null,
        expira_at:        expiraAt,
        estado:           'conectado',
        conectado_at:     new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      },
      { onConflict: 'ferreteria_id' }
    )

  if (error) throw new Error(`Error guardando configuración MP: ${error.message}`)
}

/**
 * Obtiene el access_token desencriptado del tenant.
 * Si el token está expirado, intenta refrescarlo automáticamente.
 * Retorna null si no hay configuración o el estado no es 'conectado'.
 */
export async function getAccessTokenMP(ferreteriaId: string): Promise<string | null> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('configuracion_mercadopago')
    .select('access_token_enc, refresh_token_enc, expira_at, estado')
    .eq('ferreteria_id', ferreteriaId)
    .single()

  if (!data || data.estado === 'desconectado') return null

  // Si expiró, intentar refrescar
  const expira = data.expira_at ? new Date(data.expira_at) : null
  const ahoraConMargen = new Date(Date.now() + 5 * 60 * 1000) // 5 min de margen

  if (expira && expira < ahoraConMargen && data.refresh_token_enc) {
    try {
      const refreshToken = await desencriptar(data.refresh_token_enc)
      const nuevosTokens = await refrescarToken(refreshToken)
      await guardarConfiguracionMP(ferreteriaId, nuevosTokens)
      return nuevosTokens.access_token
    } catch {
      // Marcar como expirado si no se pudo refrescar
      await admin
        .from('configuracion_mercadopago')
        .update({ estado: 'expirado', updated_at: new Date().toISOString() })
        .eq('ferreteria_id', ferreteriaId)
      return null
    }
  }

  if (!data.access_token_enc) return null

  try {
    return await desencriptar(data.access_token_enc)
  } catch {
    return null
  }
}

/**
 * Desconecta la cuenta MP de un tenant (borra tokens, cambia estado).
 */
export async function desconectarMP(ferreteriaId: string): Promise<void> {
  const admin = createAdminClient()

  const { error } = await admin
    .from('configuracion_mercadopago')
    .update({
      access_token_enc:  null,
      refresh_token_enc: null,
      mp_user_id:        null,
      mp_email:          null,
      expira_at:         null,
      estado:            'desconectado',
      updated_at:        new Date().toISOString(),
    })
    .eq('ferreteria_id', ferreteriaId)

  if (error) throw new Error(`Error desconectando MP: ${error.message}`)
}

// ─── Lectura del estado (para UI) ─────────────────────────────────────────

export interface EstadoMP {
  estado:      'conectado' | 'expirado' | 'error' | 'desconectado'
  mp_email:    string | null
  mp_user_id:  string | null
  conectado_at: string | null
  expira_at:   string | null
}

/**
 * Lee el estado de conexión MP de un tenant (sin desencriptar tokens).
 */
export async function getEstadoMP(ferreteriaId: string): Promise<EstadoMP> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('configuracion_mercadopago')
    .select('estado, mp_email, mp_user_id, conectado_at, expira_at')
    .eq('ferreteria_id', ferreteriaId)
    .single()

  if (!data) {
    return { estado: 'desconectado', mp_email: null, mp_user_id: null, conectado_at: null, expira_at: null }
  }

  return {
    estado:       data.estado as EstadoMP['estado'],
    mp_email:     data.mp_email,
    mp_user_id:   data.mp_user_id,
    conectado_at: data.conectado_at,
    expira_at:    data.expira_at,
  }
}
