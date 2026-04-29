/**
 * Cálculo de ETA para entregas
 *
 * Fase I: Haversine + factor urbano + velocidad del vehículo
 * Si ORS_API_KEY está configurada, usa OpenRouteService para mayor precisión
 */

export interface ParamsETA {
  ferreteriaLat:      number
  ferreteriaLng:      number
  clienteLat:         number
  clienteLng:         number
  velocidadKmh?:      number  // default 30
  pedidosEnCola?:     number  // default 0, cada uno suma 3 min
}

export interface ResultadoETA {
  distanciaKm:     number
  tiempoRutaMin:   number
  tiempoTotalMin:  number
  etaHora:         Date
  fuente:          'haversine' | 'ors'
}

// ── Haversine ─────────────────────────────────────────────────────────────────

const R_TIERRA_KM  = 6371
const FACTOR_URBANO = 1.35   // Las calles no son línea recta — corrección empírica
const T_PREP_BASE  = 10      // minutos de preparación base
const T_PREP_COLA  = 3       // minutos extra por pedido en cola

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R_TIERRA_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── OpenRouteService (opcional, más preciso) ─────────────────────────────────

interface ORSResponse {
  routes?: { summary?: { distance: number; duration: number } }[]
}

async function calcularPorORS(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  apiKey: string,
): Promise<{ km: number; min: number } | null> {
  try {
    const res = await fetch(
      'https://api.openrouteservice.org/v2/directions/driving-car',
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': apiKey,
        },
        body: JSON.stringify({
          coordinates: [[lng1, lat1], [lng2, lat2]],
        }),
        signal: AbortSignal.timeout(10_000),
      },
    )

    if (!res.ok) return null

    const data = (await res.json()) as ORSResponse
    const summary = data.routes?.[0]?.summary
    if (!summary) return null

    return {
      km:  Math.round((summary.distance / 1000) * 10) / 10,
      min: Math.ceil(summary.duration / 60),
    }
  } catch {
    return null
  }
}

// ── Función principal ─────────────────────────────────────────────────────────

export async function calcularETA(params: ParamsETA): Promise<ResultadoETA> {
  const {
    ferreteriaLat, ferreteriaLng,
    clienteLat,    clienteLng,
    velocidadKmh = 30,
    pedidosEnCola = 0,
  } = params

  const tPrep = T_PREP_BASE + pedidosEnCola * T_PREP_COLA
  const orsKey = process.env.ORS_API_KEY

  // Intentar ORS si hay API key configurada
  if (orsKey) {
    const ors = await calcularPorORS(
      ferreteriaLat, ferreteriaLng,
      clienteLat,    clienteLng,
      orsKey,
    )

    if (ors) {
      const total = tPrep + ors.min
      return {
        distanciaKm:    ors.km,
        tiempoRutaMin:  ors.min,
        tiempoTotalMin: total,
        etaHora:        new Date(Date.now() + total * 60_000),
        fuente:         'ors',
      }
    }
  }

  // Fallback: Haversine
  const distLineal = haversineKm(ferreteriaLat, ferreteriaLng, clienteLat, clienteLng)
  const distKm     = Math.round(distLineal * FACTOR_URBANO * 10) / 10
  const tRuta      = Math.ceil((distKm / velocidadKmh) * 60)
  const total      = tPrep + tRuta

  return {
    distanciaKm:    distKm,
    tiempoRutaMin:  tRuta,
    tiempoTotalMin: total,
    etaHora:        new Date(Date.now() + total * 60_000),
    fuente:         'haversine',
  }
}

// ── Formateadores ─────────────────────────────────────────────────────────────

/** Muestra duración: "~25 min", "~1h 10min" */
export function formatearDuracion(minutos: number): string {
  if (minutos < 60) return `~${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `~${h}h${m > 0 ? ` ${m}min` : ''}`
}

/** Muestra hora de llegada en formato Lima: "3:45 pm" */
export function formatearHoraLlegada(eta: Date): string {
  return eta.toLocaleTimeString('es-PE', {
    hour:     '2-digit',
    minute:   '2-digit',
    timeZone: 'America/Lima',
  })
}

/** ETA compacta para badge: "~25 min · 3:45 pm" */
export function formatearETACompacto(minutos: number): string {
  const llegada = new Date(Date.now() + minutos * 60_000)
  return `${formatearDuracion(minutos)} · ${formatearHoraLlegada(llegada)}`
}
