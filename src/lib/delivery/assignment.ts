/**
 * Lógica de asignación de vehículo + creación de registro de entrega.
 *
 * Estrategia de selección de vehículo (en orden de prioridad):
 *   1. Vehículo asignado actualmente al repartidor (vehiculo_actual_id)
 *   2. Vehículo activo con menor cantidad de entregas pendientes/en ruta
 *   3. null → entrega sin vehículo (se asigna manualmente desde el dashboard)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularETAHaversineSync } from './eta'

// ── Selección de vehículo ────────────────────────────────────────────────────

export async function seleccionarVehiculo(
  ferreteriaId: string,
  repartidorId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<string | null> {
  // Prioridad 1: vehículo asignado al repartidor en este momento
  if (repartidorId) {
    const { data: rep } = await supabase
      .from('repartidores')
      .select('vehiculo_actual_id')
      .eq('id', repartidorId)
      .eq('ferreteria_id', ferreteriaId)   // FERRETERÍA AISLADA
      .single()

    if (rep?.vehiculo_actual_id) return rep.vehiculo_actual_id as string
  }

  // Prioridad 2: vehículo activo con menos entregas en curso
  const { data: vehiculos } = await supabase
    .from('vehiculos')
    .select('id')
    .eq('ferreteria_id', ferreteriaId)   // FERRETERÍA AISLADA
    .eq('activo', true)
    .order('nombre')

  if (!vehiculos?.length) return null

  // Contar entregas activas por vehículo (pendiente + carga + en_ruta)
  const conteos = await Promise.all(
    vehiculos.map(async (v: { id: string }) => {
      const { count } = await supabase
        .from('entregas')
        .select('id', { count: 'exact', head: true })
        .eq('vehiculo_id', v.id)
        .in('estado', ['pendiente', 'carga', 'en_ruta'])

      return { id: v.id, carga: count ?? 0 }
    }),
  )

  // El menos cargado
  conteos.sort((a, b) => a.carga - b.carga)
  return conteos[0]?.id ?? null
}

// ── Creación de entrega ──────────────────────────────────────────────────────

// ── Recalculador en cascada ───────────────────────────────────────────────────

/**
 * Recalcula los ETAs de TODOS los pedidos delivery pendientes de la ferretería.
 * Se llama en background cuando una entrega se completa, falla o retorna,
 * ya que la cola se redujo y todos los demás ganan tiempo.
 *
 * No hace llamadas externas (solo Haversine con coords ya guardadas).
 * Es idempotente — si un pedido no tiene coords, lo omite sin error.
 */
export async function recalcularETAsCola(
  ferreteriaId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<void> {
  try {
    // 1. Coordenadas de la ferretería
    const { data: ferreteria } = await supabase
      .from('ferreterias')
      .select('lat, lng')
      .eq('id', ferreteriaId)
      .single()

    if (!ferreteria?.lat || !ferreteria?.lng) return

    // 2. Pedidos delivery activos con coords guardadas
    const { data: pedidos } = await supabase
      .from('pedidos')
      .select('id, cliente_lat, cliente_lng')
      .eq('ferreteria_id', ferreteriaId)   // FERRETERÍA AISLADA
      .eq('modalidad', 'delivery')
      .in('estado', ['confirmado', 'en_preparacion', 'enviado'])
      .not('cliente_lat', 'is', null)
      .not('cliente_lng', 'is', null)

    if (!pedidos?.length) return

    // 3. Contar TODOS los activos (con y sin coords) para la cola real
    const { count: totalActivos } = await supabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('ferreteria_id', ferreteriaId)
      .eq('modalidad', 'delivery')
      .in('estado', ['confirmado', 'en_preparacion', 'enviado'])

    // 4. Velocidad de vehículo por pedido (una sola query)
    const { data: entregas } = await supabase
      .from('entregas')
      .select('pedido_id, vehiculos(velocidad_promedio_kmh)')
      .eq('ferreteria_id', ferreteriaId)
      .in('pedido_id', pedidos.map((p) => p.id))

    const veloMap = new Map<string, number>(
      (entregas ?? []).map((e) => [
        e.pedido_id as string,
        ((e.vehiculos as unknown as { velocidad_promedio_kmh?: number } | null)
          ?.velocidad_promedio_kmh ?? 30),
      ]),
    )

    // 5. Recalcular y actualizar en paralelo
    await Promise.all(
      pedidos.map((pedido) => {
        const cola         = (totalActivos ?? pedidos.length) - 1  // excluir este mismo
        const velocidadKmh = veloMap.get(pedido.id) ?? 30

        const eta = calcularETAHaversineSync({
          ferreteriaLat: ferreteria.lat as number,
          ferreteriaLng: ferreteria.lng as number,
          clienteLat:    pedido.cliente_lat as number,
          clienteLng:    pedido.cliente_lng as number,
          velocidadKmh,
          pedidosEnCola: Math.max(0, cola),
        })

        const etaActual = new Date(Date.now() + eta.tiempoTotalMin * 60_000).toISOString()

        return Promise.all([
          supabase
            .from('pedidos')
            .update({ eta_minutos: eta.tiempoTotalMin })
            .eq('id', pedido.id)
            .eq('ferreteria_id', ferreteriaId),   // FERRETERÍA AISLADA
          supabase
            .from('entregas')
            .update({ eta_actual: etaActual })
            .eq('pedido_id', pedido.id)
            .eq('ferreteria_id', ferreteriaId),   // FERRETERÍA AISLADA
        ])
      }),
    )
  } catch (e) {
    console.error('[Delivery] recalcularETAsCola error:', e)
  }
}

export interface ParamsCrearEntrega {
  ferreteriaId: string
  pedidoId:     string
  repartidorId: string | null
  etaMinutos:   number | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase:     SupabaseClient<any>
}

/**
 * Crea el registro de entrega para un pedido de delivery.
 * Idempotente — si ya existe una entrega para el pedido, retorna su id sin duplicar.
 */
export async function crearEntrega(params: ParamsCrearEntrega): Promise<string | null> {
  const { ferreteriaId, pedidoId, repartidorId, etaMinutos, supabase } = params

  try {
    // Idempotencia: evitar duplicados
    const { data: existente } = await supabase
      .from('entregas')
      .select('id')
      .eq('pedido_id', pedidoId)
      .maybeSingle()

    if (existente) return existente.id as string

    const vehiculoId = await seleccionarVehiculo(ferreteriaId, repartidorId, supabase)

    const etaInicial = etaMinutos
      ? new Date(Date.now() + etaMinutos * 60_000).toISOString()
      : null

    const { data: entrega, error } = await supabase
      .from('entregas')
      .insert({
        ferreteria_id:         ferreteriaId,
        pedido_id:             pedidoId,
        vehiculo_id:           vehiculoId,
        repartidor_id:         repartidorId,
        estado:                'pendiente',
        eta_inicial:           etaInicial,
        eta_actual:            etaInicial,
        duracion_estimada_min: etaMinutos,
        orden_en_ruta:         1,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[Delivery] Error creando entrega:', error.message)
      return null
    }

    return entrega?.id ?? null
  } catch (e) {
    console.error('[Delivery] crearEntrega exception:', e)
    return null
  }
}
