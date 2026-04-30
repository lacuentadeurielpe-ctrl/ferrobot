// POST /api/delivery/[token]/ubicacion
// El repartidor envía su posición GPS cada ~30 s desde el navegador móvil.
// Guarda coords en repartidores + recalcula ETA en vivo para sus entregas activas.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Haversine local — no depende del módulo eta.ts
const R_KM = 6371
const FACTOR_URBANO = 1.35
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const supabase  = adminClient()

  // Auth por token — TENANT AISLADO
  const { data: repartidor } = await supabase
    .from('repartidores')
    .select('id, ferreteria_id')
    .eq('token', token)
    .eq('activo', true)
    .single()

  if (!repartidor) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { lat, lng } = body as { lat?: number; lng?: number }

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'lat y lng requeridos' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // ── Guardar posición del repartidor ───────────────────────────────────────
  await supabase
    .from('repartidores')
    .update({
      gps_ultima_lat:     lat,
      gps_ultima_lng:     lng,
      gps_actualizado_at: now,
    })
    .eq('id', repartidor.id)
    .eq('ferreteria_id', repartidor.ferreteria_id)   // FERRETERÍA AISLADA

  // ── Recalcular ETA en vivo para entregas activas de este repartidor ───────
  // Solo "en_ruta" — las pendientes no han salido todavía
  const { data: entregas } = await supabase
    .from('entregas')
    .select(`
      id,
      vehiculos(velocidad_promedio_kmh),
      pedidos(id, cliente_lat, cliente_lng, ferreteria_id)
    `)
    .eq('ferreteria_id', repartidor.ferreteria_id)   // FERRETERÍA AISLADA
    .eq('repartidor_id', repartidor.id)
    .eq('estado', 'en_ruta')

  if (entregas?.length) {
    await Promise.all(
      entregas.map((e) => {
        const pedido   = e.pedidos   as unknown as { id: string; cliente_lat: number | null; cliente_lng: number | null } | null
        const vehiculo = e.vehiculos as unknown as { velocidad_promedio_kmh?: number } | null

        if (!pedido?.cliente_lat || !pedido?.cliente_lng) return Promise.resolve()

        const distLineal  = haversineKm(lat, lng, pedido.cliente_lat, pedido.cliente_lng)
        const distKm      = Math.round(distLineal * FACTOR_URBANO * 10) / 10
        const velocidad   = vehiculo?.velocidad_promedio_kmh ?? 30
        const etaResta    = Math.ceil((distKm / velocidad) * 60)    // min restantes
        const etaActual   = new Date(Date.now() + etaResta * 60_000).toISOString()

        return Promise.all([
          supabase
            .from('pedidos')
            .update({ eta_minutos: etaResta })
            .eq('id', pedido.id)
            .eq('ferreteria_id', repartidor.ferreteria_id),   // FERRETERÍA AISLADA
          supabase
            .from('entregas')
            .update({ eta_actual: etaActual, distancia_km: distKm })
            .eq('id', e.id as string)
            .eq('ferreteria_id', repartidor.ferreteria_id),   // FERRETERÍA AISLADA
        ])
      }),
    )
  }

  return NextResponse.json({ ok: true })
}
