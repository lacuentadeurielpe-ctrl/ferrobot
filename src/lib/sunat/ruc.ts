// Consulta de RUC vía API de Decolecta (antes apis.net.pe)
// Documentación: https://docs.decolecta.com
// Variable de entorno requerida: APIS_NET_PE_TOKEN
//
// Endpoint básico:  GET https://api.decolecta.com/v1/sunat/ruc?numero={ruc}
// Endpoint avanzado: GET https://api.decolecta.com/v1/sunat/ruc/full?numero={ruc}
// Usamos el avanzado para obtener el campo `tipo` (ej: "SOCIEDAD ANONIMA CERRADA")

const DECOLECTA_BASE = 'https://api.decolecta.com/v1/sunat/ruc'
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000  // 24 horas
const CACHE_ERR_MS   = 60 * 1000             // 1 min en error temporal
const TIMEOUT_MS     = 8_000

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface RucInfo {
  ruc:               string
  razonSocial:       string
  tipoContribuyente: string   // 'SOCIEDAD ANONIMA CERRADA' | 'PERSONA NATURAL CON NEGOCIO' | ...
  estado:            string   // 'ACTIVO' | 'BAJA DE OFICIO' | ...
  condicion:         string   // 'HABIDO' | 'NO HABIDO'
  direccion:         string | null
  ubigeo:            string | null
  departamento:      string | null
  provincia:         string | null
  distrito:          string | null
  // Campos normalizados
  tipoPersona:       'natural' | 'juridica'
  tipoRucSugerido:   'ruc10' | 'ruc20'
  activo:            boolean
}

export interface RucResult {
  ok:      boolean
  data?:   RucInfo
  error?:  string
  sinToken?: boolean
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data:     RucInfo | null
  error:    string | null
  expiraAt: number
}

const cache = new Map<string, CacheEntry>()

function limpiarCacheExpirado() {
  const ahora = Date.now()
  for (const [key, entry] of cache) {
    if (entry.expiraAt < ahora) cache.delete(key)
  }
}

// ── Normalización ─────────────────────────────────────────────────────────────

function detectarTipoPersona(tipo: string, ruc: string): 'natural' | 'juridica' {
  if (ruc.startsWith('10')) return 'natural'
  if (ruc.startsWith('20')) return 'juridica'
  const t = tipo.toUpperCase()
  return t.includes('PERSONA NATURAL') || t.includes('EMPRESA INDIVIDUAL')
    ? 'natural'
    : 'juridica'
}

function detectarTipoRuc(ruc: string): 'ruc10' | 'ruc20' {
  if (ruc.startsWith('10')) return 'ruc10'
  if (ruc.startsWith('20')) return 'ruc20'
  return 'ruc10' // fallback
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function consultarRuc(ruc: string): Promise<RucResult> {
  const rucLimpio = ruc.replace(/\D/g, '')
  if (rucLimpio.length !== 11) {
    return { ok: false, error: 'RUC debe tener 11 dígitos' }
  }

  const token = process.env.APIS_NET_PE_TOKEN
  if (!token) {
    return { ok: false, error: 'Verificación SUNAT no configurada (falta APIS_NET_PE_TOKEN)', sinToken: true }
  }

  limpiarCacheExpirado()
  const cached = cache.get(rucLimpio)
  if (cached) {
    if (cached.error) return { ok: false, error: cached.error }
    if (cached.data)  return { ok: true,  data: cached.data  }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    // Usamos endpoint /full para obtener el campo `tipo`
    const url = `${DECOLECTA_BASE}/full?numero=${rucLimpio}`
    const res = await fetch(url, {
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Token inválido — verifica APIS_NET_PE_TOKEN en Vercel', sinToken: true }
    }

    if (res.status === 422 || res.status === 404) {
      const err = 'RUC no encontrado o inválido en SUNAT'
      cache.set(rucLimpio, { data: null, error: err, expiraAt: Date.now() + CACHE_ERR_MS })
      return { ok: false, error: err }
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const err = `Error API SUNAT: ${res.status}${body ? ' — ' + body.slice(0, 80) : ''}`
      cache.set(rucLimpio, { data: null, error: err, expiraAt: Date.now() + CACHE_ERR_MS })
      return { ok: false, error: err }
    }

    const raw = await res.json()

    // Decolecta usa snake_case: razon_social, numero_documento, tipo, etc.
    const tipoContrib = raw.tipo ?? ''
    const estado      = raw.estado    ?? ''
    const condicion   = raw.condicion ?? ''

    const info: RucInfo = {
      ruc:               rucLimpio,
      razonSocial:       raw.razon_social ?? '',
      tipoContribuyente: tipoContrib,
      estado,
      condicion,
      direccion:         raw.direccion   ?? null,
      ubigeo:            raw.ubigeo      ?? null,
      departamento:      raw.departamento ?? null,
      provincia:         raw.provincia   ?? null,
      distrito:          raw.distrito    ?? null,
      tipoPersona:       detectarTipoPersona(tipoContrib, rucLimpio),
      tipoRucSugerido:   detectarTipoRuc(rucLimpio),
      activo:            estado === 'ACTIVO' && condicion === 'HABIDO',
    }

    cache.set(rucLimpio, { data: info, error: null, expiraAt: Date.now() + CACHE_TTL_MS })
    return { ok: true, data: info }

  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError'
      ? 'Tiempo de espera agotado al consultar SUNAT'
      : 'Error de conexión con SUNAT'
    cache.set(rucLimpio, { data: null, error: msg, expiraAt: Date.now() + 30_000 })
    return { ok: false, error: msg }
  }
}

/** Valida formato básico de RUC (11 dígitos, empieza en 10 o 20) */
export function validarFormatoRuc(ruc: string): boolean {
  const r = ruc.replace(/\D/g, '')
  return r.length === 11 && (r.startsWith('10') || r.startsWith('20'))
}

/** true si el token está configurado */
export function sunatDisponible(): boolean {
  return !!process.env.APIS_NET_PE_TOKEN
}
