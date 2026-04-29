import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { geocodificarDireccion } from '@/lib/delivery/geocoding'

export const dynamic = 'force-dynamic'

/**
 * POST /api/settings/geocode
 * Geocodifica la dirección de la ferretería y guarda lat/lng.
 * Se llama desde VehiculosSection cuando el dueño quiere activar ETA.
 */
export async function POST() {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = await createClient()

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, nombre, direccion, lat, lng')
    .eq('id', session.ferreteriaId)
    .single()

  if (!ferreteria) return NextResponse.json({ error: 'Ferretería no encontrada' }, { status: 404 })

  if (!ferreteria.direccion?.trim()) {
    return NextResponse.json(
      { error: 'Configura la dirección de tu negocio en la pestaña General antes de activar ETA' },
      { status: 400 },
    )
  }

  const coords = await geocodificarDireccion(
    ferreteria.direccion,
    ferreteria.nombre ?? 'Perú',
  )

  if (!coords) {
    return NextResponse.json(
      { error: 'No se pudo ubicar la dirección en el mapa. Intenta con una dirección más completa (ej: "Av. Lima 123, Arequipa").' },
      { status: 422 },
    )
  }

  await supabase
    .from('ferreterias')
    .update({ lat: coords.lat, lng: coords.lng })
    .eq('id', session.ferreteriaId)

  return NextResponse.json({ lat: coords.lat, lng: coords.lng })
}
