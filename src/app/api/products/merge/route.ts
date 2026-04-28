import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionInfo } from '@/lib/auth/roles'

/**
 * POST /api/products/merge
 * Fusiona dos productos del mismo catálogo:
 *  - Suma el stock de `eliminar_id` al de `conservar_id`
 *  - Intenta eliminar `eliminar_id`. Si hay FKs activas lo desactiva en su lugar.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { conservar_id, eliminar_id } = body as { conservar_id?: string; eliminar_id?: string }

  if (!conservar_id || !eliminar_id) {
    return NextResponse.json({ error: 'Faltan conservar_id y eliminar_id' }, { status: 400 })
  }
  if (conservar_id === eliminar_id) {
    return NextResponse.json({ error: 'Los ids deben ser diferentes' }, { status: 400 })
  }

  const supabase = await createClient()

  // ── Verificar aislamiento: ambos pertenecen a esta ferretería ─────────────
  const { data: prods, error: errFetch } = await supabase
    .from('productos')
    .select('id, stock, ferreteria_id')
    .in('id', [conservar_id, eliminar_id])
    .eq('ferreteria_id', session.ferreteriaId)

  if (errFetch) return NextResponse.json({ error: errFetch.message }, { status: 500 })
  if (!prods || prods.length !== 2) {
    return NextResponse.json({ error: 'Productos no encontrados o no pertenecen a tu ferretería' }, { status: 404 })
  }

  const conservar = prods.find((p) => p.id === conservar_id)!
  const eliminar  = prods.find((p) => p.id === eliminar_id)!

  // ── Sumar stock ───────────────────────────────────────────────────────────
  const stockNuevo = (conservar.stock ?? 0) + (eliminar.stock ?? 0)

  const { error: errStock } = await supabase
    .from('productos')
    .update({ stock: stockNuevo })
    .eq('id', conservar_id)
    .eq('ferreteria_id', session.ferreteriaId)

  if (errStock) return NextResponse.json({ error: errStock.message }, { status: 500 })

  // ── Intentar eliminar el duplicado ────────────────────────────────────────
  const { error: errDelete } = await supabase
    .from('productos')
    .delete()
    .eq('id', eliminar_id)
    .eq('ferreteria_id', session.ferreteriaId)

  if (errDelete) {
    // FK activa (pedidos, cotizaciones) — desactivar en su lugar
    await supabase
      .from('productos')
      .update({ activo: false, stock: 0 })
      .eq('id', eliminar_id)
      .eq('ferreteria_id', session.ferreteriaId)

    return NextResponse.json({ ok: true, accion: 'desactivado', stock_nuevo: stockNuevo })
  }

  return NextResponse.json({ ok: true, accion: 'eliminado', stock_nuevo: stockNuevo })
}
