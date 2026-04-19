// Cliente HTTP para la API de Nubefact
// Endpoint: https://api.nubefact.com/api/v1/{ruc}/
// Auth:     Token {token}  (header Authorization)
//
// FERRETERÍA AISLADA: el token y el RUC siempre vienen del tenant,
// nunca de env vars globales.

import {
  type NubefactPayload,
  type NubefactRespuesta,
  type NubefactRespuestaOk,
  esRespuestaOk,
} from './tipos'

const NUBEFACT_BASE = 'https://api.nubefact.com/api/v1'
const TIMEOUT_MS    = 15_000

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface NubefactResultado {
  ok:    boolean
  data?: NubefactRespuestaOk
  error?: string
  /** true si el token es inválido (401/403) */
  tokenInvalido?: boolean
  /** true si SUNAT rechazó el comprobante (2xx de Nubefact pero !aceptada_por_sunat) */
  rechazadaSunat?: boolean
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Envía un comprobante a Nubefact y espera la respuesta de SUNAT.
 *
 * @param rucEmisor  RUC de la ferretería (11 dígitos)
 * @param token      Token de Nubefact del tenant (en texto plano, ya desencriptado)
 * @param payload    Datos del comprobante armados por `emitir.ts`
 */
export async function enviarANubefact(
  rucEmisor: string,
  token: string,
  payload: NubefactPayload
): Promise<NubefactResultado> {
  const url = `${NUBEFACT_BASE}/${rucEmisor}/`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Token ${token}`,
      },
      body:   JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timer)

    // ── 401/403: token inválido ──────────────────────────────────────────────
    if (res.status === 401 || res.status === 403) {
      return {
        ok:            false,
        tokenInvalido: true,
        error:         'Token Nubefact inválido — verifica en Settings → Facturación',
      }
    }

    let body: NubefactRespuesta
    try {
      body = await res.json()
    } catch {
      const texto = await res.text().catch(() => '')
      return { ok: false, error: `Nubefact devolvió respuesta no-JSON (${res.status}): ${texto.slice(0, 120)}` }
    }

    // ── Respuesta de error de Nubefact (400, 422, etc.) ──────────────────────
    if (!res.ok) {
      const errores = esRespuestaOk(body)
        ? []
        : (body.errors ?? [])
      const desc = Array.isArray(errores) && errores.length > 0
        ? errores.map((e: { description?: string }) => e.description ?? JSON.stringify(e)).join('; ')
        : `HTTP ${res.status}`
      return { ok: false, error: `Nubefact: ${desc}` }
    }

    // ── 2xx: puede ser aceptada o rechazada por SUNAT ────────────────────────
    if (!esRespuestaOk(body)) {
      const errores = body.errors ?? []
      const desc = Array.isArray(errores) && errores.length > 0
        ? errores.map((e: { description?: string }) => e.description ?? JSON.stringify(e)).join('; ')
        : 'Respuesta inesperada de Nubefact'
      return { ok: false, error: `Nubefact: ${desc}` }
    }

    if (!body.aceptada_por_sunat) {
      return {
        ok:             false,
        rechazadaSunat: true,
        error:          `SUNAT rechazó el comprobante: ${body.sunat_description ?? 'sin detalle'} (código ${body.sunat_responsecode ?? '?'})`,
        data:           body,   // guardamos igual para debug
      }
    }

    return { ok: true, data: body }

  } catch (e) {
    clearTimeout(timer)
    const msg = e instanceof Error && e.name === 'AbortError'
      ? 'Tiempo de espera agotado al conectar con Nubefact (>15s)'
      : `Error de red con Nubefact: ${e instanceof Error ? e.message : String(e)}`
    return { ok: false, error: msg }
  }
}

// ── Test de conexión ──────────────────────────────────────────────────────────

/**
 * Verifica que el token Nubefact es válido haciendo una petición mínima.
 * Nubefact no tiene un endpoint de health-check, así que enviamos un payload
 * vacío — si devuelve 401/403 el token es malo; cualquier otro error (400, 422)
 * significa que el token SÍ es válido pero el comprobante está mal formado.
 */
export async function testConexionNubefact(
  rucEmisor: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  const url = `${NUBEFACT_BASE}/${rucEmisor}/`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Token ${token}`,
      },
      body:   JSON.stringify({}),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Token inválido — verifica en tu cuenta Nubefact' }
    }
    // 400/422 → token válido, payload vacío rechazado → conexión OK
    return { ok: true }
  } catch (e) {
    clearTimeout(timer)
    return {
      ok:    false,
      error: e instanceof Error && e.name === 'AbortError'
        ? 'Tiempo de espera agotado'
        : 'No se pudo conectar con Nubefact',
    }
  }
}
