import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/orders/[id]/comprobante/pdf
// Proxy que descarga el PDF desde Supabase Storage y lo sirve como localhost
// (necesario porque el preview de Claude Code bloquea URLs externas)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('No autorizado', { status: 401 })

  const { id: pedidoId } = await params

  const { data: ferreteria } = await supabase
    .from('ferreterias').select('id').eq('owner_id', user.id).single()
  if (!ferreteria) return new Response('No autorizado', { status: 401 })

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
