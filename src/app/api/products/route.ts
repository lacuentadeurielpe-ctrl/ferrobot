import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/products — listar productos con sus reglas de descuento
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const categoriaId = searchParams.get('categoria')
  const busqueda = searchParams.get('q')
  const soloActivos = searchParams.get('activos') === 'true'

  let query = supabase
    .from('productos')
    .select('*, categorias(id, nombre), reglas_descuento(*)')
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
  const { reglas_descuento, ...productoData } = body

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'Ferretería no encontrada' }, { status: 404 })

  // Validaciones básicas
  if (!productoData.nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  if (productoData.precio_base == null || productoData.precio_base < 0)
    return NextResponse.json({ error: 'Precio inválido' }, { status: 400 })

  // Crear el producto
  const { data: producto, error: errProducto } = await supabase
    .from('productos')
    .insert({ ...productoData, ferreteria_id: ferreteria.id })
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

  // Retornar producto completo con reglas
  const { data: productoCompleto } = await supabase
    .from('productos')
    .select('*, categorias(id, nombre), reglas_descuento(*)')
    .eq('id', producto.id).single()

  return NextResponse.json(productoCompleto, { status: 201 })
}
