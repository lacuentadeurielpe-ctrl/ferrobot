import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/products/[id]
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('productos')
    .select('*, categorias(id, nombre), reglas_descuento(*), unidades_producto(*)')
    .eq('id', id).single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/products/[id] — actualizar producto, reglas de descuento y unidades adicionales
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { reglas_descuento, unidades_producto: unidadesInput, ...productoData } = body

  // Actualizar campos del producto
  const { error: errProducto } = await supabase
    .from('productos').update(productoData).eq('id', id)

  if (errProducto) return NextResponse.json({ error: errProducto.message }, { status: 500 })

  // Reemplazar reglas de descuento: borrar las anteriores e insertar las nuevas
  if (reglas_descuento !== undefined) {
    await supabase.from('reglas_descuento').delete().eq('producto_id', id)

    if (reglas_descuento.length > 0) {
      const reglas = reglas_descuento.map((r: Record<string, unknown>) => ({
        ...r,
        producto_id: id,
      }))
      const { error: errReglas } = await supabase.from('reglas_descuento').insert(reglas)
      if (errReglas) return NextResponse.json({ error: errReglas.message }, { status: 500 })
    }
  }

  // Reemplazar unidades adicionales si se enviaron
  if (unidadesInput !== undefined) {
    // Obtener ferreteria_id del producto para FERRETERÍA AISLADA
    const { data: prod } = await supabase
      .from('productos').select('ferreteria_id').eq('id', id).single()

    await supabase.from('unidades_producto').delete().eq('producto_id', id)

    if (unidadesInput.length > 0 && prod) {
      const unidades = unidadesInput.map((u: Record<string, unknown>) => ({
        ...u,
        producto_id: id,
        ferreteria_id: prod.ferreteria_id,
      }))
      const { error: errU } = await supabase.from('unidades_producto').insert(unidades)
      if (errU) return NextResponse.json({ error: errU.message }, { status: 500 })
    }
  }

  const { data: productoCompleto } = await supabase
    .from('productos')
    .select('*, categorias(id, nombre), reglas_descuento(*), unidades_producto(*)')
    .eq('id', id).single()

  return NextResponse.json(productoCompleto)
}

// DELETE /api/products/[id]
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('productos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
