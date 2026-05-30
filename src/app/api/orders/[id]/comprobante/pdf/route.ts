import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionInfo } from '@/lib/auth/roles'
import { NextResponse } from 'next/server'

// GET /api/orders/[id]/comprobante/pdf
// Ahora redirige a nuestro motor de PDFs personalizado (PlantillaTicket)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return new Response('No autorizado', { status: 401 })

  const { id: pedidoId } = await params

  const admin = createAdminClient()
  const { data: comprobante } = await admin
    .from('comprobantes')
    .select('id')
    .eq('pedido_id', pedidoId)
    .single()

  if (!comprobante) return new Response('Comprobante no encontrado', { status: 404 })

  // Redirigir al nuevo endpoint de React-PDF
  return NextResponse.redirect(new URL(`/api/comprobantes/${comprobante.id}/pdf`, request.url))
}
