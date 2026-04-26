// Cache en memoria por instancia Lambda — reduce llamadas a Supabase
// TTL 5 min: absorbe ráfagas de mensajes sin perder frescura de precios/stock.
// En Vercel serverless el cache es por función-instancia; no es global entre
// instancias pero sí reduce un >60% de los reads en instancias calientes.

import type { Producto, ZonaDelivery } from '@/types/database'

const TTL_MS = 5 * 60 * 1_000 // 5 minutos

interface Entrada<T> {
  data: T
  expira: number
}

const productosCache = new Map<string, Entrada<Producto[]>>()
const zonasCache     = new Map<string, Entrada<ZonaDelivery[]>>()

function leer<T>(map: Map<string, Entrada<T>>, key: string): T | null {
  const e = map.get(key)
  if (!e) return null
  if (Date.now() > e.expira) { map.delete(key); return null }
  return e.data
}

function guardar<T>(map: Map<string, Entrada<T>>, key: string, data: T): void {
  map.set(key, { data, expira: Date.now() + TTL_MS })
}

export const catalogCache = {
  getProductos: (id: string) => leer(productosCache, id),
  setProductos: (id: string, data: Producto[]) => guardar(productosCache, id, data),
  getZonas:     (id: string) => leer(zonasCache, id),
  setZonas:     (id: string, data: ZonaDelivery[]) => guardar(zonasCache, id, data),
  /** Invalidar cuando el dueño actualiza su catálogo desde el dashboard */
  invalidar:    (id: string) => { productosCache.delete(id); zonasCache.delete(id) },
}
