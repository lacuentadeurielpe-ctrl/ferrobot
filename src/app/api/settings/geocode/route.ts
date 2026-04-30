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
export async function POST(req: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = await createClient()

  const body = await req.json().catch(() => ({}))
  // El cliente puede pasar una dirección personalizada; si no, usamos la guardada
  const direccionOverride: string | undefined = body.direccion?.trim() || undefined

  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('id, nombre, direccion')
    .eq('id', session.ferreteriaId)
    .single()

  if (!ferreteria) return NextResponse.json({ error: 'Ferretería no encontrada' }, { status: 404 })

  const direccionAGeocodificar = direccionOverride ?? ferreteria.direccion?.trim()

  if (!direccionAGeocodificar) {
    return NextResponse.json(
      { error: 'Escribe la dirección de tu local (incluyendo ciudad o distrito).' },
      { status: 400 },
    )
  }

  const coords = await geocodificarDireccion(
    direccionAGeocodificar,
    ferreteria.nombre ?? 'Perú',
  )

  if (!coords) {
    return NextResponse.json(
      { error: `No se pudo ubicar "${direccionAGeocodificar}". Incluye la ciudad o distrito (ej: "Av. Lima 123, San Martín de Porres, Lima").` },
      { status: 422 },
    )
  }

  // Guardar coords — y también actualizar dirección si vino override (para que quede en sync)
  await supabase
    .from('ferreterias')
    .update({
      lat: coords.lat,
      lng: coords.lng,
      ...(direccionOverride ? { direccion: direccionOverride } : {}),
    })
    .eq('id', session.ferreteriaId)

  return NextResponse.json({ lat: coords.lat, lng: coords.lng, direccion: direccionAGeocodificar })
}
