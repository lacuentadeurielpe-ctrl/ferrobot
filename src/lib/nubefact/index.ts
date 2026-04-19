// Cliente HTTP para la API de Nubefact
// La RUTA es la URL completa que Nubefact asigna a cada cuenta
// (ej: https://api.nubefact.com/api/v1/01f421ab-4184-...)
// Auth: Token {token}  (header Authorization)
//
// FERRETERÍA AISLADA: la ruta y el token siempre vienen del tenant,
// nunca de env vars globales.

import {
  type NubefactPayload,
  type NubefactRespuesta,
  type NubefactRespuestaOk,
  esRespuestaOk,
} from './tipos'

const TIMEOUT_MS = 15_000

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
 * @param ruta   URL completa de la cuenta Nubefact (la "RUTA" que muestra su panel)
 * @param token  Token de Nubefact del tenant (en texto plano, ya desencriptado)
 * @param payload Datos del comprobante armados por `emitir.ts`
 */
export async function enviarANubefact(
  ruta: string,
  token: string,
  payload: NubefactPayload
): Promise<NubefactResultado> {
  // Aseguramos que la ruta termina en /
  const url = ruta.endsWith('/') ? ruta : ruta + '/'

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
      const errores = esRespuestaOk(body) ? [] : (body.errors ?? [])
      let desc: string
      if (Array.isArray(errores) && errores.length > 0) {
        desc = errores.map((e: { description?: string; code?: string }) =>
          [e.code, e.description].filter(Boolean).join(': ')
        ).join(' | ')
      } else {
        // Mostrar el body completo para debug
        desc = `HTTP ${res.status} — ${JSON.stringify(body).slice(0, 300)}`
      }
      return { ok: false, error: `Nubefact: ${desc}` }
    }

    // ── 2xx: puede ser aceptada o rechazada por SUNAT ────────────────────────
    // Intentamos interpretar la respuesta de forma flexible:
    // Nubefact puede devolver campos en distintos órdenes o con variaciones menores.
    const bodyAny = body as unknown as Record<string, unknown>

    // Detectar éxito por cualquiera de estos campos indicativos
    const tieneId       = 'nubefact_id' in bodyAny && bodyAny.nubefact_id
    const tienePdf      = 'enlace_del_pdf' in bodyAny && bodyAny.enlace_del_pdf
    const esExitoso     = tieneId || tienePdf

    if (!esExitoso) {
      // Si no tiene estructura de éxito, extraemos errores o mostramos el body raw
      const errores = (bodyAny.errors as { description?: string }[] | undefined) ?? []
      let desc: string
      if (Array.isArray(errores) && errores.length > 0) {
        desc = errores.map((e) => e.description ?? JSON.stringify(e)).join('; ')
      } else if (bodyAny.errors && typeof bodyAny.errors === 'string') {
        desc = bodyAny.errors as string
      } else {
        // Volcamos el body completo para diagnóstico
        desc = `Respuesta inesperada: ${JSON.stringify(body).slice(0, 400)}`
      }
      return { ok: false, error: `Nubefact: ${desc}` }
    }

    // Construir el objeto Ok a partir del body flexible
    const respOk = body as import('./tipos').NubefactRespuestaOk

    if (respOk.aceptada_por_sunat === false) {
      return {
        ok:             false,
        rechazadaSunat: true,
        error:          `SUNAT rechazó el comprobante: ${respOk.sunat_description ?? 'sin detalle'} (código ${respOk.sunat_responsecode ?? '?'})`,
        data:           respOk,
      }
    }

    return { ok: true, data: respOk }

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
 * Verifica que la RUTA + TOKEN son válidos enviando un payload vacío.
 * 401/403 → token malo. Cualquier otro error (400, 422) → conexión OK.
 */
export async function testConexionNubefact(
  ruta: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  const url = ruta.endsWith('/') ? ruta : ruta + '/'
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
