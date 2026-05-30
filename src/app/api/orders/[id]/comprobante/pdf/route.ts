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

  const admin = createAdminClient()
  const { data: comprobantesList } = await admin
    .from('comprobantes')
    .select('id, pdf_url')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: false })
    .limit(1)

  const comprobante = comprobantesList?.[0]

  if (!comprobante) return new Response('Comprobante no encontrado', { status: 404 })

  // Siempre usar nuestra plantilla personalizada (React-PDF)
  // para que boletas y facturas se vean con branding de la ferretería
  return NextResponse.redirect(new URL(`/api/comprobantes/${comprobante.id}/pdf`, request.url))
}
