import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

// GET /api/products — listar productos con sus reglas de descuento
export async function GET(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const categoriaId = searchParams.get('categoria')
  const busqueda = searchParams.get('q')
  const soloActivos = searchParams.get('activos') === 'true'

  let query = supabase
    .from('productos')
    .select('*, categorias(id, nombre), reglas_descuento(*), unidades_producto(*)')
    .eq('ferreteria_id', session.ferreteriaId)
    .order('nombre', { ascending: true })

  if (categoriaId) query = query.eq('categoria_id', categoriaId)
  if (busqueda) query = query.ilike('nombre', `%${busqueda}%`)
  if (soloActivos) query = query.eq('activo', true)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/products — crear producto con reglas de descuento
export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const body = await request.json()
  const { reglas_descuento, unidades_producto: unidadesInput, ...productoData } = body

  // Validaciones básicas
  if (!productoData.nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  if (productoData.precio_base == null || productoData.precio_base < 0)
    return NextResponse.json({ error: 'Precio inválido' }, { status: 400 })

  // ── Resolver categoria string → categoria_id UUID (usado por el agente IA) ──
  // El agente manda { categoria: "Cemento" } — lo convertimos a { categoria_id: "uuid" }
  if (productoData.categoria && !productoData.categoria_id) {
    const nombreCat = String(productoData.categoria).trim()
    if (nombreCat) {
      // Buscar categoría existente por nombre (case-insensitive)
      const { data: catExistente } = await supabase
        .from('categorias')
        .select('id')
        .eq('ferreteria_id', session.ferreteriaId)
        .ilike('nombre', nombreCat)
        .limit(1)
        .single()

      if (catExistente) {
        productoData.categoria_id = catExistente.id
      } else {
        // Crear la categoría si no existe
        const { data: catNueva } = await supabase
          .from('categorias')
          .insert({ ferreteria_id: session.ferreteriaId, nombre: nombreCat, orden: 99 })
          .select('id')
          .single()
        if (catNueva) productoData.categoria_id = catNueva.id
      }
    }
    delete productoData.categoria  // quitar el campo string antes del insert
  }

  // Crear el producto
  const { data: producto, error: errProducto } = await supabase
    .from('productos')
    .insert({ ...productoData, ferreteria_id: session.ferreteriaId })
    .select().single()

  if (errProducto) return NextResponse.json({ error: errProducto.message }, { status: 500 })

  // Crear reglas de descuento si las hay
  if (reglas_descuento?.length > 0) {
    const reglas = reglas_descuento.map((r: Record<string, unknown>) => ({
      ...r,
      producto_id: producto.id,
    }))
    const { error: errReglas } = await supabase.from('reglas_descuento').insert(reglas)
    if (errReglas) return NextResponse.json({ error: errReglas.message }, { status: 500 })
  }

  // Crear unidades adicionales si las hay
  if (unidadesInput?.length > 0) {
    const unidades = unidadesInput.map((u: Record<string, unknown>) => ({
      ...u,
      producto_id: producto.id,
      ferreteria_id: session.ferreteriaId,
    }))
    await supabase.from('unidades_producto').insert(unidades)
  }

  // Retornar producto completo con reglas y unidades
  const { data: productoCompleto } = await supabase
    .from('productos')
    .select('*, categorias(id, nombre), reglas_descuento(*), unidades_producto(*)')
    .eq('id', producto.id).single()

  return NextResponse.json(productoCompleto, { status: 201 })
}
