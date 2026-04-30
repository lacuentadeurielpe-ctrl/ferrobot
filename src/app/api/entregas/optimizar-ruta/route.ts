// POST /api/entregas/optimizar-ruta
// Calcula y guarda el orden óptimo de entregas para un repartidor.
// Usa nearest-neighbor sobre las coords del cliente guardadas en pedidos.
// Actualiza: entregas.orden_en_ruta, entregas.distancia_km, entregas.eta_actual,
//            pedidos.eta_minutos

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { optimizarRuta, type ParadaInput } from '@/lib/delivery/route-optimizer'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { repartidor_id } = body as { repartidor_id?: string }

  if (!repartidor_id) {
    return NextResponse.json({ error: 'repartidor_id requerido' }, { status: 400 })
  }

  const supabase = await createClient()

  // ── Verificar que el repartidor pertenece a ESTA ferretería ──────────────
  const { data: repCheck } = await supabase
    .from('repartidores')
    .select('id')
    .eq('id', repartidor_id)
    .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
    .single()

  if (!repCheck) {
    return NextResponse.json({ error: 'Repartidor no encontrado' }, { status: 404 })
  }

  // ── Coordenadas de la ferretería ──────────────────────────────────────────
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('lat, lng')
    .eq('id', session.ferreteriaId)
    .single()

  if (!ferreteria?.lat || !ferreteria?.lng) {
    return NextResponse.json({ error: 'La ferretería no tiene coordenadas guardadas. Configúralas en Ajustes → Vehículos.' }, { status: 422 })
  }

  // ── Entregas activas del repartidor (pendiente + carga) ───────────────────
  // "en_ruta" se excluye porque ya salieron — no reoganizar
  const { data: entregas, error: errEnt } = await supabase
    .from('entregas')
    .select(`
      id, orden_en_ruta,
      vehiculos(velocidad_promedio_kmh),
      pedidos(id, cliente_lat, cliente_lng, eta_minutos)
    `)
    .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
    .eq('repartidor_id', repartidor_id)
    .in('estado', ['pendiente', 'carga'])

  if (errEnt) return NextResponse.json({ error: errEnt.message }, { status: 500 })
  if (!entregas?.length) {
    return NextResponse.json({ ok: true, mensaje: 'Sin entregas pendientes para optimizar', paradas: [] })
  }

  // ── Separar entregas con coords y sin coords ──────────────────────────────
  const conCoords: ParadaInput[] = []
  const sinCoords: typeof entregas = []

  for (const e of entregas) {
    const pedido = e.pedidos as unknown as { id: string; cliente_lat: number | null; cliente_lng: number | null } | null
    const vehiculo = e.vehiculos as unknown as { velocidad_promedio_kmh?: number } | null

    if (pedido?.cliente_lat && pedido?.cliente_lng) {
      conCoords.push({
        entregaId:    e.id as string,
        pedidoId:     pedido.id,
        clienteLat:   pedido.cliente_lat,
        clienteLng:   pedido.cliente_lng,
        velocidadKmh: vehiculo?.velocidad_promedio_kmh ?? 30,
      })
    } else {
      sinCoords.push(e)
    }
  }

  // ── Optimizar las que tienen coords ──────────────────────────────────────
  const rutaOptimizada = optimizarRuta(
    ferreteria.lat as number,
    ferreteria.lng as number,
    conCoords,
  )

  // Las que no tienen coords van al final, en orden de creación (ya viene así de DB)
  const baseOrden = rutaOptimizada.length

  // ── Guardar cambios en paralelo ───────────────────────────────────────────
  const now = Date.now()

  const updates = [
    // Entregas con coords optimizadas
    ...rutaOptimizada.map((p) =>
      Promise.all([
        supabase
          .from('entregas')
          .update({
            orden_en_ruta: p.orden,
            distancia_km:  p.distanciaLegKm,
            eta_actual:    new Date(now + p.etaAcumuladaMin * 60_000).toISOString(),
            duracion_estimada_min: p.etaAcumuladaMin,
          })
          .eq('id', p.entregaId)
          .eq('ferreteria_id', session.ferreteriaId),   // FERRETERÍA AISLADA
        supabase
          .from('pedidos')
          .update({ eta_minutos: p.etaAcumuladaMin })
          .eq('id', p.pedidoId)
          .eq('ferreteria_id', session.ferreteriaId),   // FERRETERÍA AISLADA
      ])
    ),
    // Entregas sin coords: asignar orden al final, no tocar ETA
    ...sinCoords.map((e, i) =>
      supabase
        .from('entregas')
        .update({ orden_en_ruta: baseOrden + i + 1 })
        .eq('id', e.id as string)
        .eq('ferreteria_id', session.ferreteriaId)   // FERRETERÍA AISLADA
    ),
  ]

  await Promise.all(updates)

  return NextResponse.json({
    ok:      true,
    total:   entregas.length,
    optimizadas: conCoords.length,
    sin_coords:  sinCoords.length,
    paradas: rutaOptimizada,
  })
}
