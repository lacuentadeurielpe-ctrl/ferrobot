import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionInfo } from '@/lib/auth/roles'

// GET /api/orders/[id]/comprobante/pdf
// Proxy que descarga el PDF desde Supabase Storage y lo sirve como localhost
// (necesario porque el preview de Claude Code bloquea URLs externas)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return new Response('No autorizado', { status: 401 })

  const supabase = await createClient()
  const { id: pedidoId } = await params

  const admin = createAdminClient()
  const { data: comprobante } = await admin
    .from('comprobantes')
    .select('pdf_url, numero_comprobante')
    .eq('pedido_id', pedidoId)
    .single()

  if (!comprobante?.pdf_url) return new Response('Comprobante no encontrado', { status: 404 })

  // Descargar el PDF desde Supabase Storage
  const pdfRes = await fetch(comprobante.pdf_url)
  if (!pdfRes.ok) return new Response('Error descargando PDF', { status: 502 })

  const pdfBuffer = await pdfRes.arrayBuffer()

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${comprobante.numero_comprobante}.pdf"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
