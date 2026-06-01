import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionInfo } from '@/lib/auth/roles'
import { NextResponse } from 'next/server'

// GET /api/orders/[id]/comprobante/pdf
// Siempre redirige a nuestro motor de PDFs personalizado (PlantillaTicket)
// para que boletas/facturas se vean con la marca de la ferretería.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return new Response('No autorizado', { status: 401 })

  const { id: pedidoId } = await params
  const url = new URL(request.url)
  const queryId = url.searchParams.get('id')

  const admin = createAdminClient()
  let comprobanteIdToRedirect = ''

  if (queryId) {
    const { data: comprobantesList } = await admin
      .from('comprobantes')
      .select('id')
      .eq('pedido_id', pedidoId)
      .eq('id', queryId)
      .limit(1)
    
    if (comprobantesList?.[0]) {
      comprobanteIdToRedirect = comprobantesList[0].id
    }
  } else {
    const { data: list } = await admin
      .from('comprobantes')
      .select('id, tipo')
      .eq('pedido_id', pedidoId)
      .order('created_at', { ascending: false })
    
    if (list && list.length > 0) {
      const nv = list.find(c => c.tipo === 'nota_venta' || c.tipo === 'nota_venta_interna')
      comprobanteIdToRedirect = nv ? nv.id : list[0].id
    }
  }

  if (!comprobanteIdToRedirect) {
    return new Response('Comprobante no encontrado', { status: 404 })
  }

  return NextResponse.redirect(new URL(`/api/comprobantes/${comprobanteIdToRedirect}/pdf`, request.url))
}
