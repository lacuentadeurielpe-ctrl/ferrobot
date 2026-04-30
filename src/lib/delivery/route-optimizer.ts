/**
 * Optimizador de ruta multi-parada — Fase III
 *
 * Algoritmo: Nearest-Neighbor greedy
 *   • Sale desde la ferretería
 *   • Siguiente parada = la más cercana de las pendientes
 *   • Repite hasta cubrir todas
 *
 * ETA acumulada por parada:
 *   eta_stop[0] = T_PREP_BASE + leg(ferretería→stop0)
 *   eta_stop[i] = eta_stop[i-1] + T_ENTREGA_POR_PARADA + leg(stop[i-1]→stop[i])
 */

const R_TIERRA_KM        = 6371
const FACTOR_URBANO      = 1.35
const T_PREP_BASE        = 10   // min — preparación antes de salir
const T_ENTREGA_PARADA   = 3    // min — tiempo de entrega en cada parada

// ── Haversine (local, no depende del módulo eta.ts) ───────────────────────────

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R_TIERRA_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function legMinutos(distLinealKm: number, velocidadKmh: number): number {
  const distKm = distLinealKm * FACTOR_URBANO
  return Math.ceil((distKm / velocidadKmh) * 60)
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ParadaInput {
  entregaId:    string
  pedidoId:     string
  clienteLat:   number
  clienteLng:   number
  velocidadKmh?: number  // velocidad del vehículo asignado; default 30
}

export interface ParadaOptimizada {
  entregaId:        string
  pedidoId:         string
  orden:            number   // 1-indexed
  etaAcumuladaMin:  number   // tiempo total desde salida hasta llegar a ESTA parada
  distanciaLegKm:   number   // distancia del leg (parada anterior → esta)
}

// ── Algoritmo principal ───────────────────────────────────────────────────────

export function optimizarRuta(
  ferreteriaLat:     number,
  ferreteriaLng:     number,
  paradas:           ParadaInput[],
  velocidadDefaultKmh = 30,
): ParadaOptimizada[] {
  if (paradas.length === 0) return []

  // Caso trivial: una sola parada
  if (paradas.length === 1) {
    const p   = paradas[0]
    const vel = p.velocidadKmh ?? velocidadDefaultKmh
    const distLineal = haversineKm(ferreteriaLat, ferreteriaLng, p.clienteLat, p.clienteLng)
    const distLeg    = Math.round(distLineal * FACTOR_URBANO * 10) / 10
    const eta        = T_PREP_BASE + legMinutos(distLineal, vel)
    return [{ entregaId: p.entregaId, pedidoId: p.pedidoId, orden: 1, etaAcumuladaMin: eta, distanciaLegKm: distLeg }]
  }

  // Nearest-neighbor greedy
  const pendientes    = [...paradas]
  const ruta: ParadaOptimizada[] = []
  let currentLat      = ferreteriaLat
  let currentLng      = ferreteriaLng
  let tiempoAcumulado = T_PREP_BASE

  while (pendientes.length > 0) {
    // Encontrar la parada más cercana a la posición actual (distancia lineal)
    let minDistLineal = Infinity
    let minIdx        = 0
    for (let i = 0; i < pendientes.length; i++) {
      const d = haversineKm(currentLat, currentLng, pendientes[i].clienteLat, pendientes[i].clienteLng)
      if (d < minDistLineal) { minDistLineal = d; minIdx = i }
    }

    const siguiente  = pendientes[minIdx]
    const vel        = siguiente.velocidadKmh ?? velocidadDefaultKmh
    const distLegKm  = Math.round(minDistLineal * FACTOR_URBANO * 10) / 10

    // Si no es la primera parada, añadir tiempo de entrega de la parada anterior
    if (ruta.length > 0) tiempoAcumulado += T_ENTREGA_PARADA
    tiempoAcumulado += legMinutos(minDistLineal, vel)

    ruta.push({
      entregaId:       siguiente.entregaId,
      pedidoId:        siguiente.pedidoId,
      orden:           ruta.length + 1,
      etaAcumuladaMin: tiempoAcumulado,
      distanciaLegKm:  distLegKm,
    })

    // Avanzar posición actual a esta parada
    currentLat = siguiente.clienteLat
    currentLng = siguiente.clienteLng
    pendientes.splice(minIdx, 1)
  }

  return ruta
}
