// POST /api/comprobantes/emitir — emite una boleta electrónica vía Nubefact
//
// FERRETERÍA AISLADA:
//   - session.ferreteriaId es la única fuente de verdad del tenant
//   - emitirBoleta() pasa ferreteriaId a todas las queries internas
//   - El pedido se valida contra ferreteriaId antes de emitir

import { NextResponse } from 'next/server'
import { getSessionInfo } from '@/lib/auth/roles'
import { emitirBoleta }   from '@/lib/comprobantes/emitir'

export async function POST(request: Request) {
  const session = await getSessionInfo()
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: {
    pedido_id?:      string
    cliente_nombre?: string
    cliente_dni?:    string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (!body.pedido_id) {
    return NextResponse.json({ error: 'pedido_id es requerido' }, { status: 400 })
  }

  const resultado = await emitirBoleta({
    pedidoId:      body.pedido_id,
    ferreteriaId:  session.ferreteriaId,  // FERRETERÍA AISLADA — desde la sesión, nunca del body
    tipoBoleta:    'boleta',
    clienteNombre: (body.cliente_nombre ?? '').trim() || 'CLIENTE VARIOS',
    clienteDni:    (body.cliente_dni    ?? '').trim(),
    emitidoPor:    'dashboard',
  })

  if (!resultado.ok) {
    const status = resultado.tokenInvalido ? 503 : 422
    return NextResponse.json(
      {
        error:          resultado.error,
        tokenInvalido:  resultado.tokenInvalido ?? false,
        comprobanteId:  resultado.comprobanteId ?? null,
      },
      { status }
    )
  }

  return NextResponse.json({
    ok:             true,
    comprobanteId:  resultado.comprobanteId,
    numeroCompleto: resultado.numeroCompleto,
    pdfUrl:         resultado.pdfUrl,
    xmlUrl:         resultado.xmlUrl,
  })
}
