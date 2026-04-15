import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reenviarComprobante } from '@/lib/pdf/generar-comprobante'

// POST /api/orders/[id]/comprobante/reenviar — reenvía el PDF existente por WhatsApp
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: pedidoId } = await params

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const resultado = await reenviarComprobante({
    pedidoId,
    ferreteriaId: ferreteria.id,
  })

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 500 })
  }

  return NextResponse.json(resultado)
}
