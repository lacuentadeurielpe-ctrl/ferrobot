import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

// Columnas esperadas en el archivo (mapeadas a nuestros campos)
const UNIDADES_VALIDAS = ['unidad', 'bolsa', 'saco', 'metro', 'metro cuadrado', 'galón', 'litro', 'kilo', 'tonelada', 'rollo', 'plancha', 'caja', 'par']

export interface FilaProducto {
  fila: number
  nombre: string
  descripcion?: string
  categoria?: string
  precio_base: number
  unidad: string
  stock: number
  errores: string[]
  /** Si está presente, actualiza este producto en lugar de crear uno nuevo */
  producto_id_actualizar?: string
}

// POST /api/upload/products
// Recibe JSON con array de filas parseadas desde el cliente
// Valida y crea/actualiza los productos en Supabase
export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()

  const { filas }: { filas: FilaProducto[] } = await request.json()
  if (!filas?.length) return NextResponse.json({ error: 'No hay datos para importar' }, { status: 400 })

  // Separar filas a insertar vs actualizar
  const filasNuevas    = filas.filter((f) => !f.producto_id_actualizar)
  const filasActualizar = filas.filter((f) => !!f.producto_id_actualizar)

  // ── Obtener/crear categorías necesarias ─────────────────────────────────────
  const categoriasNecesarias = [...new Set(filas.map((f) => f.categoria).filter(Boolean))] as string[]
  const mapaCategoria: Record<string, string> = {} // nombre → id

  if (categoriasNecesarias.length > 0) {
    const { data: existentes } = await supabase
      .from('categorias')
      .select('id, nombre')
      .eq('ferreteria_id', session.ferreteriaId)
      .in('nombre', categoriasNecesarias)

    existentes?.forEach((c) => { mapaCategoria[c.nombre] = c.id })

    // Crear las categorías que no existen
    const nuevas = categoriasNecesarias.filter((nombre) => !mapaCategoria[nombre])
    if (nuevas.length > 0) {
      const { data: creadas } = await supabase
        .from('categorias')
        .insert(nuevas.map((nombre) => ({ ferreteria_id: session.ferreteriaId, nombre })))
        .select('id, nombre')

      creadas?.forEach((c) => { mapaCategoria[c.nombre] = c.id })
    }
  }

  // ── Insertar productos nuevos ────────────────────────────────────────────────
  let insertados = 0
  if (filasNuevas.length > 0) {
    const productosAInsertar = filasNuevas.map((fila) => ({
      ferreteria_id: session.ferreteriaId,
      nombre: fila.nombre.trim(),
      descripcion: fila.descripcion?.trim() || null,
      categoria_id: fila.categoria ? (mapaCategoria[fila.categoria] ?? null) : null,
      precio_base: fila.precio_base,
      unidad: fila.unidad || 'unidad',
      stock: fila.stock ?? 0,
      activo: true,
    }))

    const { data: creados, error } = await supabase
      .from('productos')
      .insert(productosAInsertar)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    insertados = creados?.length ?? 0
  }

  // ── Actualizar productos existentes ─────────────────────────────────────────
  let actualizados = 0
  for (const fila of filasActualizar) {
    const { error } = await supabase
      .from('productos')
      .update({
        nombre: fila.nombre.trim(),
        descripcion: fila.descripcion?.trim() || null,
        categoria_id: fila.categoria ? (mapaCategoria[fila.categoria] ?? null) : null,
        precio_base: fila.precio_base,
        unidad: fila.unidad || 'unidad',
        stock: fila.stock ?? 0,
      })
      .eq('id', fila.producto_id_actualizar!)
      .eq('ferreteria_id', session.ferreteriaId)   // aislamiento

    if (!error) actualizados++
  }

  return NextResponse.json({
    importados: insertados + actualizados,
    insertados,
    actualizados,
    categorias_creadas: Object.keys(mapaCategoria).length,
  })
}
