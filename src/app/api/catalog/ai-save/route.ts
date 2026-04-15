import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ItemParaGuardar {
  accion: 'crear' | 'actualizar'
  producto_existente_id?: string | null
  nombre: string
  descripcion?: string | null
  categoria?: string | null
  precio_base?: number | null
  precio_compra?: number | null
  unidad?: string | null
  stock?: number | null
}

// POST /api/catalog/ai-save — guarda los productos confirmados por el dueño
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'Ferretería no encontrada' }, { status: 404 })

  const { items }: { items: ItemParaGuardar[] } = await request.json()
  if (!items?.length) return NextResponse.json({ error: 'Sin items para guardar' }, { status: 400 })

  // Resolver categorías (obtener/crear) para los items que la necesiten
  const nombresCategoria = [...new Set(items.map((i) => i.categoria).filter(Boolean))] as string[]
  const mapaCategoria: Record<string, string> = {}

  if (nombresCategoria.length > 0) {
    const { data: existentes } = await supabase
      .from('categorias').select('id, nombre')
      .eq('ferreteria_id', ferreteria.id)
      .in('nombre', nombresCategoria)

    existentes?.forEach((c) => { mapaCategoria[c.nombre] = c.id })

    const nuevas = nombresCategoria.filter((n) => !mapaCategoria[n])
    if (nuevas.length > 0) {
      const { data: creadas } = await supabase
        .from('categorias')
        .insert(nuevas.map((nombre) => ({ ferreteria_id: ferreteria.id, nombre })))
        .select('id, nombre')
      creadas?.forEach((c) => { mapaCategoria[c.nombre] = c.id })
    }
  }

  const paraCrear = items.filter((i) => i.accion === 'crear')
  const paraActualizar = items.filter((i) => i.accion === 'actualizar' && i.producto_existente_id)

  let creados = 0
  let actualizados = 0

  // ── Crear nuevos ──────────────────────────────────────────────────────────
  if (paraCrear.length > 0) {
    const insertData = paraCrear.map((item) => ({
      ferreteria_id: ferreteria.id,
      nombre: item.nombre.trim(),
      descripcion: item.descripcion?.trim() || null,
      categoria_id: item.categoria ? (mapaCategoria[item.categoria] ?? null) : null,
      precio_base: item.precio_base ?? 0,
      precio_compra: item.precio_compra ?? 0,
      unidad: item.unidad || 'unidad',
      stock: item.stock ?? 0,
      activo: true,
    }))

    const { data: productosCreados, error } = await supabase
      .from('productos').insert(insertData).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    creados = productosCreados?.length ?? 0
  }

  // ── Actualizar existentes (en paralelo) ───────────────────────────────────
  if (paraActualizar.length > 0) {
    const updates = paraActualizar.map((item) =>
      supabase
        .from('productos')
        .update({
          nombre: item.nombre.trim(),
          descripcion: item.descripcion?.trim() || null,
          categoria_id: item.categoria ? (mapaCategoria[item.categoria] ?? null) : null,
          precio_base: item.precio_base ?? 0,
          precio_compra: item.precio_compra ?? 0,
          unidad: item.unidad || 'unidad',
          stock: item.stock ?? 0,
        })
        .eq('id', item.producto_existente_id!)
        .eq('ferreteria_id', ferreteria.id)
    )

    const resultados = await Promise.all(updates)
    const errores = resultados.filter((r) => r.error)
    if (errores.length > 0) {
      console.error('[ai-save] Errores actualizando:', errores.map((r) => r.error?.message))
    }
    actualizados = resultados.filter((r) => !r.error).length
  }

  return NextResponse.json({ creados, actualizados })
}
