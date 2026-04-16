import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reenviarComprobante } from '@/lib/pdf/generar-comprobante'
import { getSessionInfo } from '@/lib/auth/roles'

// POST /api/orders/[id]/comprobante/reenviar — reenvía el PDF existente por WhatsApp
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { id: pedidoId } = await params

  const resultado = await reenviarComprobante({
    pedidoId,
    ferreteriaId: session.ferreteriaId,
  })

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 500 })
  }

  return NextResponse.json(resultado)
}
