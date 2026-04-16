import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionInfo } from '@/lib/auth/roles'

// GET /api/orders/[id]/comprobante/view
// Devuelve una página HTML que embebe el PDF vía el proxy local.
// Funciona incluso en browsers que bloquean URLs externas.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionInfo()
  if (!session) return new Response('No autorizado', { status: 401 })

  const supabase = await createClient()
  const { id: pedidoId } = await params

  const admin = createAdminClient()
  const { data: comprobante } = await admin
    .from('comprobantes')
    .select('numero_comprobante, pdf_url')
    .eq('pedido_id', pedidoId)
    .single()

  if (!comprobante?.pdf_url) {
    return new Response(`
      <html><body style="font-family:sans-serif;padding:2rem;color:#666">
        <h2>Sin comprobante</h2>
        <p>El comprobante aún no fue generado para este pedido.</p>
        <p>Asegúrate de que el pedido esté en estado <strong>confirmado</strong>.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' }, status: 404 })
  }

  const pdfProxyUrl = `/api/orders/${pedidoId}/comprobante/pdf`
  const numero = comprobante.numero_comprobante

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${numero}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #f3f4f6; display: flex; flex-direction: column; height: 100vh; }
    header {
      background: white; border-bottom: 1px solid #e5e7eb;
      padding: 0.75rem 1.25rem; display: flex; align-items: center;
      gap: 1rem; flex-shrink: 0;
    }
    header h1 { font-size: 0.95rem; font-weight: 600; color: #111; }
    header span { font-size: 0.8rem; color: #6b7280; }
    .actions { margin-left: auto; display: flex; gap: 0.5rem; }
    .btn {
      display: inline-flex; align-items: center; gap: 0.4rem;
      padding: 0.4rem 0.9rem; border-radius: 0.5rem; font-size: 0.8rem;
      font-weight: 500; cursor: pointer; text-decoration: none; border: none;
    }
    .btn-primary { background: #1e40af; color: white; }
    .btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
    .btn:hover { opacity: 0.88; }
    embed { flex: 1; width: 100%; border: none; }
    .no-pdf {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 1rem; color: #6b7280;
    }
    .no-pdf p { font-size: 0.9rem; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${numero}</h1>
      <span>Comprobante de pago</span>
    </div>
    <div class="actions">
      <a class="btn btn-secondary" href="${pdfProxyUrl}" download="${numero}.pdf">⬇ Descargar</a>
      <a class="btn btn-primary" href="${pdfProxyUrl}" target="_blank">Abrir PDF ↗</a>
    </div>
  </header>
  <embed src="${pdfProxyUrl}" type="application/pdf" />
  <noscript>
    <div class="no-pdf">
      <p>Tu navegador no puede mostrar el PDF aquí.</p>
      <a class="btn btn-primary" href="${pdfProxyUrl}" download="${numero}.pdf">⬇ Descargar PDF</a>
    </div>
  </noscript>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
