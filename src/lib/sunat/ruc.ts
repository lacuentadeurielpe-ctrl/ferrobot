// Consulta de RUC vía API de SUNAT
// Proveedor: api.apis.net.pe — requiere token Bearer gratuito (registro en apis.net.pe)
// Variable de entorno requerida: APIS_NET_PE_TOKEN
//
// Si el token no está configurado, la verificación queda deshabilitada pero
// el usuario puede guardar el RUC manualmente sin validar.
//
// Cacheo en memoria con TTL de 24 horas para reducir llamadas a la API.

const SUNAT_API_BASE = 'https://api.apis.net.pe/v2/sunat/ruc'
const CACHE_TTL_MS   = 24 * 60 * 60 * 1000  // 24 horas
const CACHE_ERR_MS   = 60 * 1000             // 1 min en error temporal
const TIMEOUT_MS     = 8_000

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface RucInfo {
  ruc:               string
  razonSocial:       string
  tipoContribuyente: string   // 'PERSONA NATURAL CON NEGOCIO' | 'SOCIEDAD ANONIMA CERRADA' | ...
  estado:            string   // 'ACTIVO' | 'BAJA DE OFICIO' | 'SUSPENDIDO' | ...
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
  ok:    boolean
  data?: RucInfo
  error?: string
  /** true cuando el token no está configurado — el front puede mostrar mensaje diferente */
  sinToken?: boolean
}

// ── Cache en memoria ───────────────────────────────────────────────────────────

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

// ── Normalización ──────────────────────────────────────────────────────────────

function detectarTipoPersona(tipoContribuyente: string): 'natural' | 'juridica' {
  const t = tipoContribuyente.toUpperCase()
  return t.includes('PERSONA NATURAL') || t.includes('EMPRESA INDIVIDUAL')
    ? 'natural'
    : 'juridica'
}

function detectarTipoRuc(ruc: string, tipoContribuyente: string): 'ruc10' | 'ruc20' {
  if (ruc.startsWith('10')) return 'ruc10'
  if (ruc.startsWith('20')) return 'ruc20'
  return detectarTipoPersona(tipoContribuyente) === 'natural' ? 'ruc10' : 'ruc20'
}

// ── Función principal ──────────────────────────────────────────────────────────

export async function consultarRuc(ruc: string): Promise<RucResult> {
  const rucLimpio = ruc.replace(/\D/g, '')
  if (rucLimpio.length !== 11) {
    return { ok: false, error: 'RUC debe tener 11 dígitos' }
  }

  // Si no hay token configurado, indicarlo claramente
  const token = process.env.APIS_NET_PE_TOKEN
  if (!token) {
    return {
      ok:       false,
      error:    'Verificación SUNAT no configurada (falta APIS_NET_PE_TOKEN)',
      sinToken: true,
    }
  }

  // Cache
  limpiarCacheExpirado()
  const cached = cache.get(rucLimpio)
  if (cached) {
    if (cached.error) return { ok: false, error: cached.error }
    if (cached.data)  return { ok: true,  data: cached.data  }
  }

  // Llamada a la API
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(`${SUNAT_API_BASE}?numero=${rucLimpio}`, {
      headers: {
        'Accept':        'application/json',
        'Authorization': `Bearer ${token}`,
      },
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (res.status === 401) {
      // Token inválido o expirado
      return { ok: false, error: 'Token SUNAT inválido — verifica APIS_NET_PE_TOKEN en Vercel', sinToken: true }
    }

    if (res.status === 404) {
      const err = 'RUC no encontrado en SUNAT'
      cache.set(rucLimpio, { data: null, error: err, expiraAt: Date.now() + CACHE_ERR_MS })
      return { ok: false, error: err }
    }

    if (!res.ok) {
      const err = `Error SUNAT API: ${res.status}`
      cache.set(rucLimpio, { data: null, error: err, expiraAt: Date.now() + CACHE_ERR_MS })
      return { ok: false, error: err }
    }

    const raw = await res.json()

    const tipoContrib = raw.tipoContribuyente ?? raw.tipo_contribuyente ?? ''
    const estado      = raw.estado     ?? ''
    const condicion   = raw.condicion  ?? ''

    const info: RucInfo = {
      ruc:               rucLimpio,
      razonSocial:       raw.razonSocial ?? raw.nombre ?? '',
      tipoContribuyente: tipoContrib,
      estado,
      condicion,
      direccion:         raw.direccion    ?? null,
      ubigeo:            raw.ubigeo       ?? null,
      departamento:      raw.departamento ?? null,
      provincia:         raw.provincia    ?? null,
      distrito:          raw.distrito     ?? null,
      tipoPersona:       detectarTipoPersona(tipoContrib),
      tipoRucSugerido:   detectarTipoRuc(rucLimpio, tipoContrib),
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

/** true si el token APIS_NET_PE_TOKEN está configurado */
export function sunatDisponible(): boolean {
  return !!process.env.APIS_NET_PE_TOKEN
}
