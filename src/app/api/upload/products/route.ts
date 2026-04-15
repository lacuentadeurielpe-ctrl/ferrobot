import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Columnas esperadas en el archivo (mapeadas a nuestros campos)
const COLUMNAS_REQUERIDAS = ['nombre', 'precio_base']
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
}

// POST /api/upload/products
// Recibe JSON con array de filas parseadas desde el cliente
// Valida y crea los productos en Supabase
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'Ferretería no encontrada' }, { status: 404 })

  const { filas }: { filas: FilaProducto[] } = await request.json()
  if (!filas?.length) return NextResponse.json({ error: 'No hay datos para importar' }, { status: 400 })

  // Obtener/crear categorías necesarias
  const categoriasNecesarias = [...new Set(filas.map((f) => f.categoria).filter(Boolean))] as string[]
  const mapaCategoria: Record<string, string> = {} // nombre → id

  if (categoriasNecesarias.length > 0) {
    const { data: existentes } = await supabase
      .from('categorias')
      .select('id, nombre')
      .eq('ferreteria_id', ferreteria.id)
      .in('nombre', categoriasNecesarias)

    existentes?.forEach((c) => { mapaCategoria[c.nombre] = c.id })

    // Crear las categorías que no existen
    const nuevas = categoriasNecesarias.filter((nombre) => !mapaCategoria[nombre])
    if (nuevas.length > 0) {
      const { data: creadas } = await supabase
        .from('categorias')
        .insert(nuevas.map((nombre) => ({ ferreteria_id: ferreteria.id, nombre })))
        .select('id, nombre')

      creadas?.forEach((c) => { mapaCategoria[c.nombre] = c.id })
    }
  }

  // Insertar productos en lote
  const productosAInsertar = filas.map((fila) => ({
    ferreteria_id: ferreteria.id,
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

  return NextResponse.json({
    importados: creados?.length ?? 0,
    categorias_creadas: Object.keys(mapaCategoria).length,
  })
}
