import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generarYEnviarComprobante } from '@/lib/pdf/generar-comprobante'

// GET /api/orders/[id]/comprobante — obtener comprobante existente
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: pedidoId } = await params

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: comprobante, error } = await admin
    .from('comprobantes')
    .select('*')
    .eq('pedido_id', pedidoId)
    .single()

  if (error || !comprobante) {
    return NextResponse.json({ error: 'Sin comprobante' }, { status: 404 })
  }

  return NextResponse.json(comprobante)
}

// POST /api/orders/[id]/comprobante — generar y enviar comprobante
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id: pedidoId } = await params

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const resultado = await generarYEnviarComprobante({
    pedidoId,
    ferreteriaId: ferreteria.id,
  })

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 500 })
  }

  return NextResponse.json(resultado)
}
