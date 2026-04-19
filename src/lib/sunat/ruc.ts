// Consulta de RUC vía API pública de SUNAT (sin registro ni API key)
// Proveedor: api.apis.net.pe — gratuito, documentación: https://apis.net.pe/
//
// Cacheo en memoria con TTL de 24 horas para no hammear la API.
// En Vercel cada instancia tiene su propio cache (serverless functions),
// pero es suficiente para reducir latencia en llamadas repetidas en el mismo worker.

const SUNAT_API_URL = 'https://api.apis.net.pe/v2/sunat/ruc'
const CACHE_TTL_MS  = 24 * 60 * 60 * 1000 // 24 horas
const TIMEOUT_MS    = 8_000               // 8s — no bloquear al usuario demasiado

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface RucInfo {
  ruc:                string
  razonSocial:        string
  tipoContribuyente:  string   // 'PERSONA NATURAL CON NEGOCIO' | 'SOCIEDAD ANONIMA CERRADA' | ...
  estado:             string   // 'ACTIVO' | 'BAJA DE OFICIO' | 'SUSPENDIDO' | ...
  condicion:          string   // 'HABIDO' | 'NO HABIDO'
  direccion:          string | null
  ubigeo:             string | null
  departamento:       string | null
  provincia:          string | null
  distrito:           string | null
  // Campos normalizados derivados
  tipoPersona:        'natural' | 'juridica'
  tipoRucSugerido:    'ruc10' | 'ruc20'
  activo:             boolean   // estado === 'ACTIVO' && condicion === 'HABIDO'
}

export interface RucResult {
  ok:    boolean
  data?: RucInfo
  error?: string
}

// ── Cache en memoria ───────────────────────────────────────────────────────────

interface CacheEntry {
  data:       RucInfo | null
  error:      string | null
  expiraAt:   number
}

const cache = new Map<string, CacheEntry>()

function limpiarCacheExpirado() {
  const ahora = Date.now()
  for (const [key, entry] of cache) {
    if (entry.expiraAt < ahora) cache.delete(key)
  }
}

// ── Normalización ──────────────────────────────────────────────────────────────

/** Detecta si el RUC pertenece a una persona natural o jurídica */
function detectarTipoPersona(tipoContribuyente: string): 'natural' | 'juridica' {
  const t = tipoContribuyente.toUpperCase()
  if (
    t.includes('PERSONA NATURAL') ||
    t.includes('EMPRESA INDIVIDUAL')
  ) return 'natural'
  return 'juridica'
}

/** Sugiere tipo_ruc basado en el RUC y tipo de contribuyente.
 *  RUC que empieza en 10 → persona natural (ruc10)
 *  RUC que empieza en 20 → empresa (ruc20) */
function detectarTipoRuc(ruc: string, tipoContribuyente: string): 'ruc10' | 'ruc20' {
  if (ruc.startsWith('10')) return 'ruc10'
  if (ruc.startsWith('20')) return 'ruc20'
  // Fallback por tipo de contribuyente
  return detectarTipoPersona(tipoContribuyente) === 'natural' ? 'ruc10' : 'ruc20'
}

// ── Función principal ──────────────────────────────────────────────────────────

/**
 * Consulta el RUC en la API pública de SUNAT.
 * Devuelve null si el RUC no existe o hay error de red.
 * Usa cache en memoria con TTL de 24h.
 */
export async function consultarRuc(ruc: string): Promise<RucResult> {
  const rucLimpio = ruc.replace(/\D/g, '')
  if (rucLimpio.length !== 11) {
    return { ok: false, error: 'RUC debe tener 11 dígitos' }
  }

  // Revisar cache
  limpiarCacheExpirado()
  const cached = cache.get(rucLimpio)
  if (cached) {
    if (cached.error) return { ok: false, error: cached.error }
    if (cached.data)  return { ok: true,  data: cached.data  }
  }

  // Llamar a la API
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(`${SUNAT_API_URL}?numero=${rucLimpio}`, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const err = res.status === 404
        ? 'RUC no encontrado en SUNAT'
        : `Error SUNAT API: ${res.status}`
      cache.set(rucLimpio, { data: null, error: err, expiraAt: Date.now() + 60_000 }) // cache corto en error
      return { ok: false, error: err }
    }

    const raw = await res.json()

    // La API retorna el campo con nombres en español
    const tipoContrib = raw.tipoContribuyente ?? raw.tipo_contribuyente ?? ''
    const estado      = raw.estado     ?? ''
    const condicion   = raw.condicion  ?? ''

    const info: RucInfo = {
      ruc:               rucLimpio,
      razonSocial:       raw.razonSocial       ?? raw.nombre ?? '',
      tipoContribuyente: tipoContrib,
      estado,
      condicion,
      direccion:         raw.direccion         ?? null,
      ubigeo:            raw.ubigeo            ?? null,
      departamento:      raw.departamento      ?? null,
      provincia:         raw.provincia         ?? null,
      distrito:          raw.distrito          ?? null,
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
