import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generarYEnviarComprobante } from '@/lib/pdf/generar-comprobante'
import { getSessionInfo } from '@/lib/auth/roles'
import { getYCloudApiKey } from '@/lib/tenant'

// GET /api/orders/[id]/comprobante — obtener comprobante existente
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { id: pedidoId } = await params

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
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { id: pedidoId } = await params

  const ycloudApiKey = await getYCloudApiKey(session.ferreteriaId)
  const resultado = await generarYEnviarComprobante({
    pedidoId,
    ferreteriaId: session.ferreteriaId,
    ycloudApiKey,
  })

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 500 })
  }

  return NextResponse.json(resultado)
}
