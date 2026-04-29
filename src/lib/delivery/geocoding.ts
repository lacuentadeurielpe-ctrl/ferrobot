/**
 * Geocoding con Nominatim (OpenStreetMap) — sin API key, gratis
 * ToS: máximo 1 req/seg, User-Agent obligatorio, no spamear la misma dirección
 * Cacheamos resultados en clientes.lat/lng para evitar repetir consultas
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT    = 'FerroBot/1.0 (ferrobot-flax.vercel.app; contacto@ferrobot.pe)'

export interface Coordenadas {
  lat: number
  lng: number
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  importance: number
}

/**
 * Convierte una dirección de texto en coordenadas lat/lng.
 * Busca primero en Perú (countrycodes=pe).
 * Retorna null si no encuentra resultado.
 */
export async function geocodificarDireccion(
  direccion: string,
  ciudad = 'Perú',
): Promise<Coordenadas | null> {
  if (!direccion?.trim()) return null

  const query = `${direccion.trim()}, ${ciudad}`

  try {
    const url = new URL(NOMINATIM_URL)
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'json')
    url.searchParams.set('limit', '1')
    url.searchParams.set('countrycodes', 'pe')
    url.searchParams.set('addressdetails', '0')

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent':      USER_AGENT,
        'Accept-Language': 'es',
        'Accept':          'application/json',
      },
      signal: AbortSignal.timeout(8_000),
      // Importante: no cachear en Vercel para no violar ToS de Nominatim
      cache: 'no-store',
    })

    if (!res.ok) return null

    const data = (await res.json()) as NominatimResult[]
    if (!data.length) return null

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    }
  } catch {
    return null
  }
}

/**
 * Geocodifica la dirección de una ferretería y la guarda en la BD.
 * Solo llama a Nominatim si la ferretería aún no tiene coordenadas.
 */
export async function geocodificarFerreteria(
  ferreteriaId: string,
  direccion: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Coordenadas | null> {
  // Revisar si ya tiene coords
  const { data: ferreteria } = await supabase
    .from('ferreterias')
    .select('lat, lng, nombre')
    .eq('id', ferreteriaId)
    .single()

  if (ferreteria?.lat && ferreteria?.lng) {
    return { lat: ferreteria.lat, lng: ferreteria.lng }
  }

  const coords = await geocodificarDireccion(direccion)
  if (!coords) return null

  await supabase
    .from('ferreterias')
    .update({ lat: coords.lat, lng: coords.lng })
    .eq('id', ferreteriaId)

  return coords
}

/**
 * Geocodifica la dirección de un cliente y la cachea en la BD.
 * Si el cliente ya tiene coords y la dirección coincide, retorna las cacheadas.
 */
export async function geocodificarCliente(
  telefono: string,
  direccion: string,
  ferreteriaId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<Coordenadas | null> {
  // Buscar en caché
  const { data: cliente } = await supabase
    .from('clientes')
    .select('lat, lng, direccion_geocodificada')
    .eq('telefono', telefono)
    .eq('ferreteria_id', ferreteriaId)
    .single()

  if (
    cliente?.lat &&
    cliente?.lng &&
    cliente?.direccion_geocodificada === direccion
  ) {
    return { lat: cliente.lat, lng: cliente.lng }
  }

  const coords = await geocodificarDireccion(direccion)
  if (!coords) return null

  // Guardar en caché
  await supabase
    .from('clientes')
    .update({
      lat: coords.lat,
      lng: coords.lng,
      direccion_geocodificada: direccion,
    })
    .eq('telefono', telefono)
    .eq('ferreteria_id', ferreteriaId)

  return coords
}
